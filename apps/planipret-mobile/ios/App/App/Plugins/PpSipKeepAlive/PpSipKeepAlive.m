#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PpSipKeepAlive, "PpSipKeepAlive",
  CAP_PLUGIN_METHOD(startSipService, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(stopSipService, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getSipServiceStatus, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(triggerReregister, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(acknowledgeIncoming, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(wakeForIncomingCall, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(setCallActive, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(setAudioRoute, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getAudioRoute, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(addListener, CAPPluginReturnCallback);
  CAP_PLUGIN_METHOD(removeAllListeners, CAPPluginReturnPromise);
)
