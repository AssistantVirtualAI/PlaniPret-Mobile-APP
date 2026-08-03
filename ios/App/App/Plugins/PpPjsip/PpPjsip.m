#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PpPjsip, "PpPjsip",
  CAP_PLUGIN_METHOD(registerTest, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(initialize, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(register, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(unregister, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(makeCall, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(answerCall, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(hangupCall, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(setMute, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(setSpeaker, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(sendDTMF, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getState, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(addListener, CAPPluginReturnCallback);
  CAP_PLUGIN_METHOD(removeAllListeners, CAPPluginReturnPromise);
)
