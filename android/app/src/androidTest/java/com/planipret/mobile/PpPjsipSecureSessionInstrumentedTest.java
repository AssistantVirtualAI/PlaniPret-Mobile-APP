package com.planipret.mobile;

import static org.junit.Assert.assertTrue;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Runs on Android Keystore, not on a JVM substitute. It uses a test-only alias,
 * placeholder data and example.invalid, therefore it does not connect to
 * NetSapiens or access any broker credential.
 */
@RunWith(AndroidJUnit4.class)
public final class PpPjsipSecureSessionInstrumentedTest {
  @Test public void savesThenReloads1142MWithoutCallerSuppliedIv() throws Exception {
    boolean restored = PpPjsipEngine.verifySecureSessionRoundTripForInstrumentation(
      InstrumentationRegistry.getInstrumentation().getTargetContext(), "1142M");
    assertTrue("Android Keystore must restore the generated-IV 1142M test session", restored);
  }

  @Test public void discardsLegacySecureSessionWithoutPbXActivity() {
    boolean discarded = PpPjsipEngine.verifyLegacySessionIsDiscardedForInstrumentation(
      InstrumentationRegistry.getInstrumentation().getTargetContext());
    assertTrue("legacy Android Keystore session must be removed locally", discarded);
  }
}
