import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Alert, Linking, Platform } from 'react-native';

class MediaService {
  private static instance: MediaService;

  static getInstance(): MediaService {
    if (!MediaService.instance) {
      MediaService.instance = new MediaService();
    }
    return MediaService.instance;
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync(false);

      if (status === 'granted') return true;

      if (!canAskAgain) {
        Alert.alert(
          'İzin Gerekli',
          "Videoyu galerine kaydetmek için medya erişim iznini Ayarlar'dan manuel olarak açman gerekiyor.",
          [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Ayarları Aç', onPress: () => Linking.openSettings() },
          ]
        );
        return false;
      }

      Alert.alert(
        'İzin Reddedildi',
        'Videoyu galerine kaydedebilmek için medya kütüphanesi iznine ihtiyaç var.',
        [{ text: 'Tamam', style: 'cancel' }]
      );
      return false;
    } catch (err) {
      console.error('[MediaService] requestPermissions error:', err);
      return false;
    }
  }

  async saveToLibrary(videoPath: string): Promise<boolean> {
    try {
      const granted = await this.requestPermissions();
      if (!granted) return false;

      const cleanPath = videoPath.startsWith('file://')
        ? videoPath.slice(7)
        : videoPath;

      const finalPath = Platform.OS === 'android' ? cleanPath : videoPath;

      console.log('[MediaService] Saving to library:', finalPath);

      await MediaLibrary.saveToLibraryAsync(finalPath);
      console.log('[MediaService] Saved successfully.');

      Alert.alert('✅ Kaydedildi', 'Video başarıyla galerine kaydedildi.');
      return true;
    } catch (err: any) {
      console.error('[MediaService] saveToLibrary error:', err);

      const message = err?.message || '';
      if (message.includes('permission') || message.includes('Permission')) {
        Alert.alert(
          'İzin Hatası',
          "Galeriye erişim izni verilmedi. Ayarlar'dan izni kontrol et.",
          [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Ayarları Aç', onPress: () => Linking.openSettings() },
          ]
        );
      } else if (message.includes('exist') || message.includes('path')) {
        Alert.alert('Dosya Hatası', "Video dosyası bulunamadı. Export'u tekrar dene.");
      } else {
        Alert.alert('Kaydetme Hatası', `Video kaydedilemedi: ${message}`);
      }
      return false;
    }
  }

  async share(videoPath: string): Promise<void> {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Paylaşım Desteklenmiyor', 'Bu cihazda paylaşım özelliği kullanılamıyor.');
        return;
      }

      const sharePath = videoPath.startsWith('file://')
        ? videoPath
        : `file://${videoPath}`;

      await Sharing.shareAsync(sharePath, {
        mimeType: 'video/mp4',
        dialogTitle: 'Videoyu Paylaş',
        UTI: 'public.movie',
      });
    } catch (err: any) {
      console.error('[MediaService] share error:', err);
      Alert.alert('Paylaşım Hatası', `Paylaşılamadı: ${err?.message}`);
    }
  }
}

export const mediaService = MediaService.getInstance();