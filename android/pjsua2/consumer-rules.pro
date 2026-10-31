# PJSUA2/SWIG registers Java callbacks from libpjsua2 at runtime. Keep every
# generated class and member: R8 cannot see JNI-originated references.
-keep class org.pjsip.pjsua2.** { *; }
