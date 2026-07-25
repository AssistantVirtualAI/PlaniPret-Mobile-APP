# NetSapiens Push Notifications — Research Notes

## Architecture NetSapiens / SNAPmobile

### Comment SNAPmobile reçoit les appels en background
NetSapiens utilise **RFC 8599** — SIP Push Notification.

Le principe :
1. L'app iOS enregistre un token PushKit (APNs VoIP) via `PKPushRegistry`
2. Lors du SIP REGISTER, le Contact header inclut les paramètres push :
   ```
   Contact: <sip:user@domain;pn-provider=apns;pn-prid=<VOIP_TOKEN>;pn-param=<BUNDLE_ID>>
   ```
3. NetSapiens (serveur SIP) stocke ces paramètres
4. Quand un appel arrive, NetSapiens envoie un VoIP push APNs directement à l'iPhone
5. L'iPhone se réveille, PushKit déclenche `didReceiveIncomingPushWith`
6. L'app affiche l'écran CallKit natif
7. L'utilisateur répond → l'app se connecte au serveur SIP et répond l'appel

### Ce qui est nécessaire côté NetSapiens (admin)
- Uploader le certificat APNs VoIP (.p12 ou .p8) dans le portail NetSapiens
- Le bundle ID de l'app doit correspondre

### API NetSapiens pour les devices
- `POST /domains/{domain}/users/{user}/devices` — crée un device avec push config
- Paramètres importants : `device-push-enabled: yes`, `device-sip-registration-uri`

### Solution pour Planipret (sans modifier NetSapiens)
Puisque NetSapiens utilise RFC 8599, il faut inclure les paramètres pn-* dans le
Contact header du SIP REGISTER. C'est ce que fait SNAPmobile nativement.

**Notre approche** : Modifier `PpSipKeepAlive.swift` pour inclure les paramètres
`pn-provider=apns.voip;pn-prid=<TOKEN>;pn-param=<BUNDLE_ID>` dans le Contact header
du REGISTER SIP. NetSapiens va alors envoyer le VoIP push automatiquement.

### Entitlements requis dans App.entitlements
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.developer.pushkit.unrestricted-voip</key>
    <true/>
    <key>aps-environment</key>
    <string>development</string>
</dict>
</plist>
```

### Certificat APNs VoIP
- Créer dans Apple Developer Portal → Certificates → VoIP Services Certificate
- Bundle ID: com.planipret.mobile
- Exporter en .p12
- Uploader dans le portail NetSapiens admin

## Sources
- RFC 8599: https://datatracker.ietf.org/doc/html/rfc8599
- NetSapiens API: https://netsapiens-api.apidog.io/api-4683906
- SNAPmobile docs: https://www.crexendo.help/en_US/user-guides/imported-article-09-apr-16-42
