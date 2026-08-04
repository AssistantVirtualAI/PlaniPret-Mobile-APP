import re

with open("ios/App/App/Plugins/PpPjsip/PpPjsipEngine.swift", "r") as f:
    content = f.read()

# 1. Ajouter registrationServer et registrationPort
content = re.sub(
    r'(private var domain = "")',
    r'\1\n    private var registrationServer = ""\n    private var registrationPort = 5061',
    content
)

# 2. Assigner server et port dans configure
content = re.sub(
    r'(self\.domain = domain)',
    r'\1\n        self.registrationServer = server\n        self.registrationPort = port',
    content
)

# 3. Modifier le pendingAnswer timeout de 30s à 5s et ajouter le re-provisioning
old_timeout = r'''            DispatchQueue\.global\(qos: \.userInitiated\)\.asyncAfter\(deadline: \.now\(\) \+ 30\.0\) \{ \[weak self\] in
                guard let self = self else \{ return \}
                self\.lock\.lock\(\)
                let stillPending = self\.pendingAnswerRequest
                let pending = self\.pendingAnswerCompletions
                if stillPending \{
                    self\.pendingAnswerRequest = false
                    self\.pendingAnswerCallId = nil
                    self\.pendingAnswerCompletions = \[\]
                \}
                self\.lock\.unlock\(\)
                if stillPending \{
                    NSLog\("\[PpPjsip\] pendingAnswer timeout 30s → no_active_call"\)
                    pending\.forEach \{ \$0\(false\) \}
                \}
            \}'''

new_timeout = r'''            // Si aucun INVITE TLS n'arrive rapidement, demander au JS de
            // réaligner immédiatement le device NetSapiens avant d'expirer.
            DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 5.0) { [weak self] in
                guard let self = self else { return }
                self.lock.lock()
                let stillPending = self.pendingAnswerRequest
                let pending = self.pendingAnswerCompletions
                if stillPending {
                    self.pendingAnswerRequest = false
                    self.pendingAnswerCallId = nil
                    self.pendingAnswerCompletions = []
                }
                self.lock.unlock()
                if stillPending {
                    let contact = "sip:\(self.username)@\(self.domain);transport=tls"
                    NSLog("[PpPjsip] pendingAnswer timeout 5s → TLS re-provision requested contact=%@", contact)
                    self.emit("registrationRepairRequested", [
                        "transport": "tls", "sipPort": self.registrationPort,
                        "contact": contact, "server": self.registrationServer,
                        "reason": "incoming_invite_missing"
                    ])
                    NotificationCenter.default.post(name: .ppPjsipAnswerResult, object: nil, userInfo: ["ok": false])
                    pending.forEach { $0(false) }
                }
            }'''

content = re.sub(old_timeout, new_timeout, content)

# 4. Modifier handleRegState pour envoyer le payload complet et l'événement registered
old_regstate = r'''        registered = code == 200
        let state = registered \? "registered" : \(code == 0 \? "unregistered" : "failed"\)
        emit\("registrationState", \["state": state, "code": code, "reason": reason, "username": username\]\)'''

new_regstate = r'''        registered = code == 200
        let state = registered ? "registered" : (code == 0 ? "unregistered" : "failed")
        let contact = "sip:\(username)@\(domain);transport=tls"
        let payload: [String: Any] = [
            "state": state, "code": code, "reason": reason,
            "username": username, "contact": contact,
            "transport": "tls", "sipPort": registrationPort,
            "server": registrationServer
        ]
        emit("registrationState", payload)
        if registered {
            NSLog("[PpPjsip] registered contact=%@ server=%@:%d", contact, registrationServer, registrationPort)
            emit("registered", payload)
        }'''

content = re.sub(old_regstate, new_regstate, content)

with open("ios/App/App/Plugins/PpPjsip/PpPjsipEngine.swift", "w") as f:
    f.write(content)

print("PpPjsipEngine.swift updated.")
