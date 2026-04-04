import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Alert, Linking } from 'react-native';

class MediaService {
  private static instance: MediaService;

  static getInstance(): MediaService {
    if (!MediaService.instance) {
      MediaService.instance = new MediaService();
    }
    return MediaService.instance;
  }

  async requestPermissions(): Promise<boolean> {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    return status === 'granted';
  }

  async saveToLibrary(videoPath: string): Promise<void> {
    const granted = await this.requestPermissions();

    if (!granted) {
      Alert.alert(
        'Permission Required',
        'Media library access is needed to save videos. Please enable it in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    await MediaLibrary.saveToLibraryAsync(videoPath);
  }

  async share(videoPath: string): Promise<void> {
    await Sharing.shareAsync(videoPath);
  }
}

export const mediaService = MediaService.getInstance();
