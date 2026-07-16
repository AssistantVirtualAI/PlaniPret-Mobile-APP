import { IVoiceConnector } from './base-connector';
import { VapiConnector } from './vapi-connector';
import { RetellConnector } from './retell-connector';
import { ElevenLabsConnector } from './elevenlabs-connector';

export type ConnectorType = 'vapi' | 'retell' | 'elevenlabs';

/**
 * Factory for creating connector instances
 */
export class ConnectorFactory {
  /**
   * Create a connector instance based on platform type
   */
  static createConnector(
    platform: ConnectorType,
    apiKey: string,
    baseUrl?: string
  ): IVoiceConnector {
    switch (platform) {
      case 'vapi':
        return new VapiConnector(apiKey, baseUrl);
      case 'retell':
        return new RetellConnector(apiKey, baseUrl);
      case 'elevenlabs':
        return new ElevenLabsConnector(apiKey, baseUrl);
      default:
        throw new Error(`Unsupported connector platform: ${platform}`);
    }
  }

  /**
   * Get list of supported platforms
   */
  static getSupportedPlatforms(): ConnectorType[] {
    return ['vapi', 'retell', 'elevenlabs'];
  }

  /**
   * Get platform display name
   */
  static getPlatformDisplayName(platform: ConnectorType): string {
    const names: Record<ConnectorType, string> = {
      vapi: 'Vapi',
      retell: 'Retell AI',
      elevenlabs: 'ElevenLabs',
    };
    return names[platform];
  }

  /**
   * Get platform icon/logo name
   */
  static getPlatformIcon(platform: ConnectorType): string {
    const icons: Record<ConnectorType, string> = {
      vapi: 'phone',
      retell: 'bot',
      elevenlabs: 'mic',
    };
    return icons[platform];
  }
}
