import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Directory, Paths } from 'expo-file-system';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import {
  User,
  Crown,
  ChevronRight,
  HardDrive,
  Volume2,
  Monitor,
  Sparkles,
  Trash2,
  Star,
  Shield,
  FileText,
  HelpCircle,
  Download,
  Activity,
} from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Colors } from '@/src/constants/colors';
import { useSubscriptionStore } from '@/src/stores/subscriptionStore';
import { useSettingsStore } from '@/src/stores/settingsStore';
import { transcriptionService } from '@/src/services/transcriptionService';
import { ffmpegService } from '@/src/services/ffmpegService';
import { RESOLUTION_OPTIONS } from '@/src/constants/exportPresets';
import { ASPECT_RATIOS } from '@/src/constants/subtitleStyles';
import type { Resolution, AspectRatio } from '@/src/types';

const { background, surface, surfaceElevated, primary, textPrimary, textSecondary, border, danger, success } = Colors;

const APP_STORE_URL = 'https://apps.apple.com/app/id000000000';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.blitzcut';

export default function SettingsScreen() {
  const router = useRouter();
  const { isPremium, togglePremium, debugProMode, toggleDebugProMode, isUserPremium } = useSubscriptionStore();
  const hasPremium = isUserPremium();
  const { hapticEnabled, setHapticEnabled, autoDownloadModel, setAutoDownloadModel, defaultResolution, setDefaultResolution, defaultAspectRatio, setDefaultAspectRatio } = useSettingsStore();

  const [storageUsed, setStorageUsed] = useState(0);
  const [storageTotal] = useState(512);
  const [modelDownloaded, setModelDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  useEffect(() => {
    transcriptionService.isModelDownloaded().then(setModelDownloaded);

    // FIX #16: Gerçek cache boyutunu hesapla
    const calcStorage = async () => {
      try {
        const cacheDir = new Directory(Paths.cache);
        if (cacheDir.exists) {
          let totalBytes = 0;
          const entries = cacheDir.list();
          for (const entry of entries) {
            try {
              const s = (entry as any).size;
              if (typeof s === 'number') totalBytes += s;
            } catch { }
          }
          setStorageUsed(Math.round(totalBytes / (1024 * 1024)));
        }
      } catch {
        setStorageUsed(0);
      }
    };
    void calcStorage();
  }, []);

  const handleDownloadModel = async () => {
    if (downloadProgress !== null) return;
    setDownloadProgress(0);
    try {
      await transcriptionService.downloadModel((progress) => {
        setDownloadProgress(progress);
      });
      setModelDownloaded(true);
    } catch {
      Alert.alert('Hata', 'Model indirilemedi. Lütfen tekrar deneyin.');
    } finally {
      setDownloadProgress(null);
    }
  };

  const handleClearCache = async () => {
    Alert.alert(
      'Clear Cache',
      'This will delete all temporary files and cached data. Your projects will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              const cacheDir = new Directory(Paths.cache);
              if (cacheDir.exists) {
                cacheDir.delete();
              }
              setStorageUsed(0);
              Alert.alert('Success', 'Cache cleared successfully');
            } catch {
              Alert.alert('Error', 'Failed to clear cache');
            }
          },
        },
      ]
    );
  };

  const handleTestFFmpeg = async () => {
    try {
      const result = await ffmpegService.checkSystem();
      if (result.success) {
        Alert.alert(
          '✅ FFmpeg Calisiyor',
          `Sürüm: ${result.version}\n\nNative bridge aktif ve komutları başarıyla işliyor.`,
          [{ text: 'Tamam' }]
        );
      } else {
        Alert.alert(
          '❌ FFmpeg Hatası',
          `FFmpeg kütüphanesi başlatılamadı.\n\nHata: ${result.error}`,
          [{ text: 'Tamam' }]
        );
      }
    } catch (err: any) {
      Alert.alert('Hata', `Test sırasında bir hata oluştu: ${err.message}`);
    }
  };

  const handleUpgrade = () => {
    router.push('/paywall');
  };

  const handleRateApp = async () => {
    const url = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
    await WebBrowser.openBrowserAsync(url);
  };

  const storagePercentage = (storageUsed / storageTotal) * 100;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* Profile Section */}
      <Animated.View entering={FadeIn.delay(100)} style={styles.profileSection}>
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <User size={32} color={primary} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>BlitzCut User</Text>
            <View style={[styles.planBadge, isPremium && styles.planBadgePremium]}>
              <Crown size={12} color={isPremium ? '#FFFFFF' : primary} />
              <Text style={[styles.planText, isPremium && styles.planTextPremium]}>
                {hasPremium ? 'Premium' : 'Free Plan'}
              </Text>
            </View>
          </View>
          {!hasPremium && (
            <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
              <Text style={styles.upgradeButtonText}>Upgrade</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Export Settings */}
      <Animated.View entering={FadeIn.delay(200)} style={styles.section}>
        <Text style={styles.sectionTitle}>Export Settings</Text>
        
        <View style={styles.card}>
          <View style={styles.row}>
            <Monitor size={20} color={textSecondary} />
            <Text style={styles.rowLabel}>Default Resolution</Text>
            <View style={styles.pickerContainer}>
              {RESOLUTION_OPTIONS.map((res) => (
                <TouchableOpacity
                  key={res.value}
                  style={[
                    styles.pickerItem,
                    defaultResolution === res.value && styles.pickerItemActive,
                    res.premium && !hasPremium && styles.pickerItemLocked,
                  ]}
                  onPress={() => {
                    if (res.premium && !hasPremium) {
                      handleUpgrade();
                    } else {
                      setDefaultResolution(res.value);
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      defaultResolution === res.value && styles.pickerItemTextActive,
                      res.premium && !hasPremium && styles.pickerItemTextLocked,
                    ]}
                  >
                    {res.label}
                  </Text>
                  {res.premium && !hasPremium && (
                    <Crown size={12} color={textSecondary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Monitor size={20} color={textSecondary} />
            <Text style={styles.rowLabel}>Default Aspect Ratio</Text>
            <View style={styles.aspectPicker}>
              {ASPECT_RATIOS.map((ratio: typeof ASPECT_RATIOS[0]) => (
                <TouchableOpacity
                  key={ratio.value}
                  style={[
                    styles.aspectItem,
                    defaultAspectRatio === ratio.value && styles.aspectItemActive,
                  ]}
                  onPress={() => setDefaultAspectRatio(ratio.value)}
                >
                  <Text
                    style={[
                      styles.aspectItemText,
                      defaultAspectRatio === ratio.value && styles.aspectItemTextActive,
                    ]}
                  >
                    {ratio.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Animated.View>

      {/* AI Settings */}
      <Animated.View entering={FadeIn.delay(300)} style={styles.section}>
        <Text style={styles.sectionTitle}>AI & Transcription</Text>
        
        <View style={styles.card}>
          {/* Whisper model status */}
          <View style={styles.modelRow}>
            <View style={styles.switchRowLeft}>
              <Sparkles size={20} color={textSecondary} />
              <View>
                <Text style={styles.rowLabel}>Whisper Modeli</Text>
                <Text style={[styles.modelStatus, modelDownloaded ? styles.modelStatusDownloaded : styles.modelStatusMissing]}>
                  {modelDownloaded ? 'İndirildi ✓' : 'İndirilmedi (~75MB)'}
                </Text>
              </View>
            </View>
            {!modelDownloaded && downloadProgress === null && (
              <TouchableOpacity style={styles.downloadButton} onPress={handleDownloadModel}>
                <Download size={14} color="#FFFFFF" />
                <Text style={styles.downloadButtonText}>İndir</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Download progress bar */}
          {downloadProgress !== null && (
            <View style={styles.downloadProgressContainer}>
              <View style={styles.downloadProgressTrack}>
                <View style={[styles.downloadProgressFill, { width: `${Math.round(downloadProgress * 100)}%` }]} />
              </View>
              <Text style={styles.downloadProgressText}>{Math.round(downloadProgress * 100)}%</Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={styles.switchRowLeft}>
              <Sparkles size={20} color={textSecondary} />
              <Text style={styles.rowLabel}>Auto-download Whisper Model</Text>
            </View>
            <Switch
              value={autoDownloadModel}
              onValueChange={setAutoDownloadModel}
              trackColor={{ false: border, true: `${primary}50` }}
              thumbColor={autoDownloadModel ? primary : textSecondary}
            />
          </View>
        </View>
      </Animated.View>

      {/* Preferences */}
      <Animated.View entering={FadeIn.delay(400)} style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchRowLeft}>
              <Volume2 size={20} color={textSecondary} />
              <Text style={styles.rowLabel}>Haptic Feedback</Text>
            </View>
            <Switch
              value={hapticEnabled}
              onValueChange={setHapticEnabled}
              trackColor={{ false: border, true: `${primary}50` }}
              thumbColor={hapticEnabled ? primary : textSecondary}
            />
          </View>
        </View>
      </Animated.View>

      {/* Storage */}
      <Animated.View entering={FadeIn.delay(500)} style={styles.section}>
        <Text style={styles.sectionTitle}>Storage</Text>
        
        <View style={styles.card}>
          <View style={styles.storageHeader}>
            <View style={styles.switchRowLeft}>
              <HardDrive size={20} color={textSecondary} />
              <Text style={styles.rowLabel}>Used Storage</Text>
            </View>
            <Text style={styles.storageText}>
              {storageUsed} MB / {storageTotal} MB
            </Text>
          </View>
          
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${storagePercentage}%` }]} />
          </View>

          <TouchableOpacity style={styles.clearButton} onPress={handleClearCache}>
            <Trash2 size={18} color={danger} />
            <Text style={styles.clearButtonText}>Clear Cache</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* About */}
      <Animated.View entering={FadeIn.delay(600)} style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        
        <View style={styles.card}>
          <TouchableOpacity style={styles.linkRow} onPress={handleRateApp}>
            <Star size={20} color={textSecondary} />
            <Text style={styles.rowLabel}>Uygulamayı Değerlendir</Text>
            <ChevronRight size={20} color={textSecondary} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.linkRow}>
            <Shield size={20} color={textSecondary} />
            <Text style={styles.rowLabel}>Privacy Policy</Text>
            <ChevronRight size={20} color={textSecondary} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.linkRow}>
            <FileText size={20} color={textSecondary} />
            <Text style={styles.rowLabel}>Terms of Service</Text>
            <ChevronRight size={20} color={textSecondary} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.linkRow}>
            <HelpCircle size={20} color={textSecondary} />
            <Text style={styles.rowLabel}>Contact Support</Text>
            <ChevronRight size={20} color={textSecondary} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* // DEBUG_ONLY_START */}
      <Animated.View entering={FadeIn.delay(700)} style={styles.section}>
        <Text style={[styles.sectionTitle, { color: danger }]}>Geliştirici Ayarları (Test)</Text>
        <View style={[styles.card, { borderColor: danger }]}>
            <View style={styles.switchRow}>
              <View style={styles.switchRowLeft}>
                <Sparkles size={20} color={danger} />
                <View>
                  <Text style={[styles.rowLabel, { color: danger, fontWeight: 'bold' }]}>Pro Özellikleri Test Et</Text>
                  <Text style={{ fontSize: 11, color: textSecondary }}>
                    Bu buton aktifken tüm kilitler kalkar.
                  </Text>
                </View>
              </View>
              <Switch
                value={debugProMode}
                onValueChange={toggleDebugProMode}
                trackColor={{ false: border, true: `${danger}50` }}
                thumbColor={debugProMode ? danger : textSecondary}
              />
            </View>
          <View style={styles.switchRow}>
            <View style={styles.switchRowLeft}>
              <Activity size={20} color={danger} />
              <View>
                <Text style={[styles.rowLabel, { color: danger, fontWeight: 'bold' }]}>FFmpeg Tanı Aracı</Text>
                <Text style={{ fontSize: 11, color: textSecondary }}>
                  Kütüphanenin düzgün çalışıp çalışmadığını test et.
                </Text>
              </View>
            </View>
            <TouchableOpacity 
              style={[styles.downloadButton, { backgroundColor: danger }]} 
              onPress={handleTestFFmpeg}
            >
              <Text style={styles.downloadButtonText}>Test Et</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
      {/* // DEBUG_ONLY_END */}

      <View style={styles.versionContainer}>
        <Text style={styles.versionText}>Versiyon: {appVersion}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: textPrimary,
  },
  profileSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: border,
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    color: textPrimary,
    marginBottom: 6,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: `${primary}20`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  planBadgePremium: {
    backgroundColor: primary,
  },
  planText: {
    fontSize: 12,
    fontWeight: '600',
    color: primary,
  },
  planTextPremium: {
    color: '#FFFFFF',
  },
  upgradeButton: {
    backgroundColor: primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  upgradeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  card: {
    backgroundColor: surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'column',
    padding: 16,
    gap: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  switchRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    fontSize: 16,
    color: textPrimary,
  },
  modelStatus: {
    fontSize: 12,
    marginTop: 2,
  },
  modelStatusDownloaded: {
    color: success,
  },
  modelStatusMissing: {
    color: textSecondary,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  downloadButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  downloadProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  downloadProgressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  downloadProgressFill: {
    height: '100%',
    backgroundColor: primary,
  },
  downloadProgressText: {
    fontSize: 12,
    color: textSecondary,
    minWidth: 36,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: border,
    marginHorizontal: 16,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: surfaceElevated,
  },
  pickerItemActive: {
    backgroundColor: `${primary}30`,
  },
  pickerItemLocked: {
    opacity: 0.5,
  },
  pickerItemText: {
    fontSize: 14,
    color: textSecondary,
  },
  pickerItemTextActive: {
    color: primary,
    fontWeight: '600',
  },
  pickerItemTextLocked: {
    color: textSecondary,
  },
  aspectPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  aspectItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: surfaceElevated,
  },
  aspectItemActive: {
    backgroundColor: `${primary}30`,
  },
  aspectItemText: {
    fontSize: 14,
    color: textSecondary,
  },
  aspectItemTextActive: {
    color: primary,
    fontWeight: '600',
  },
  storageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 12,
  },
  storageText: {
    fontSize: 14,
    color: textSecondary,
  },
  progressContainer: {
    height: 4,
    backgroundColor: border,
    marginHorizontal: 16,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    backgroundColor: primary,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: border,
  },
  clearButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: danger,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  debugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
    backgroundColor: surface,
    borderRadius: 12,
  },
  debugText: {
    fontSize: 14,
    color: textSecondary,
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  versionText: {
    fontSize: 14,
    color: textSecondary,
  },
});
