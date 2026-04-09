import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ChevronLeft, Upload, Lock as LockIcon, Check } from 'lucide-react-native';

import { Colors } from '@/src/constants/colors';
import { SUBTITLE_PRESETS, LANGUAGES, SPEED_OPTIONS, ASPECT_RATIOS, BACKGROUND_TRACKS } from '@/src/constants/subtitleStyles';
import { PLATFORM_PRESETS, RESOLUTION_OPTIONS } from '@/src/constants/exportPresets';
import { useProjectStore } from '@/src/stores/projectStore';
import { useEditorStore } from '@/src/stores/editorStore';
import { useSubscriptionStore } from '@/src/stores/subscriptionStore';
import { useVideoEditor } from '@/src/hooks/useVideoEditor';
import { VideoPlayer } from '@/src/components/editors/VideoPlayer';
import { ToolBar, EditorTab } from '@/src/components/editors/ToolBar';
import { Timeline } from '@/src/components/editors/Timeline';
import { LoadingOverlay } from '@/src/components/ui/LoadingOverlay';
import { Toggle } from '@/src/components/ui/Toggle';
import { Slider } from '@/src/components/ui/Slider';
import { Button } from '@/src/components/ui/Button';
import type { LanguageCode } from '@/src/types';

const { background, surface, surfaceElevated, primary, textPrimary, textSecondary, border } = Colors;

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const SLIDER_WIDTH = windowWidth - 64; // Horizontal padding
  const router = useRouter();
  const { getProjectById, updateProject } = useProjectStore();
  const project = getProjectById(id);
  
  const {
    isPremium,
    canUseSubtitleStyle,
  } = useSubscriptionStore();
  
  const {
    silenceSettings,
    updateSilenceSettings,
    silenceSegments,
    toggleSilenceExcluded,
    subtitleStyle,
    setSubtitleStyle,
    applyPreset,
    subtitleSegments,
    audioSettings,
    updateAudioSettings,
    adjustSettings,
    updateAdjustSettings,
    isProcessing,
    processingProgress,
    processingStep,
  } = useEditorStore();

  const [activeTab, setActiveTab] = useState<EditorTab>('silence');
  const [projectName, setProjectName] = useState(project?.name || '');
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>('en');
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [exportedVideoPath, setExportedVideoPath] = useState<string | undefined>(undefined);

  const isTrimInvalid =
    adjustSettings.trimEnd > 0 &&
    adjustSettings.trimStart >= adjustSettings.trimEnd;

  // FIX #8: project null ise güvenli fallback — hook'lar koşullu çağrılamaz
  // useVideoEditor null-safe bir dummy project ile çağrılır, project null ise erken return yapılır
  const safeProject = project ?? {
    id: '',
    name: '',
    originalVideoPath: '',
    duration: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'draft' as const,
  };

  const {
    detectSilences,
    applySilenceRemoval,
    transcribe,
    exportVideo,
  } = useVideoEditor(safeProject);

  // FIX: Sadece farklı proje açılınca reset et — aynı projede geri gidip gelince state silinmesin
  useEffect(() => {
    if (project) {
      const store = useEditorStore.getState();
      const currentId = store.currentProject?.id;
      if (currentId !== project.id) {
        store.resetEditor();
        store.setCurrentProject(project);
        setProjectName(project.name);
        setExportedVideoPath(undefined);
      }
    }
  }, [project?.id]);

  const handleNameChange = useCallback((name: string) => {
    setProjectName(name);
    if (project && name !== project.name) {
      updateProject(project.id, { name });
    }
  }, [project, updateProject]);

  const handlePresetSelect = (_presetKey: string) => {
    if (!canUseSubtitleStyle(_presetKey)) {
      router.push('/paywall');
      return;
    }
    applyPreset(_presetKey);
  };

  const handleExport = async () => {
    if (!project) return;
    if (isTrimInvalid) return;
    
    // Background music path'i sadece gerçek bir dosya ise geç
    const resolvedMusicPath = audioSettings.musicPath && audioSettings.musicPath.startsWith('/')
      ? audioSettings.musicPath
      : undefined;

    const config = {
      videoPath: project.processedVideoPath || project.originalVideoPath,
      platform: 'tiktok' as const,
      aspectRatio: adjustSettings.aspectRatio,
      resolution: '1080p' as const,
      fps: 30 as const,
      includeSubtitles: true,
      watermark: !isPremium,
      audioVolume: audioSettings.originalVolume,
      musicPath: resolvedMusicPath,
      musicVolume: resolvedMusicPath ? audioSettings.musicVolume : undefined,
      trimStart: adjustSettings.trimStart > 0 ? adjustSettings.trimStart : undefined,
      trimEnd: adjustSettings.trimEnd > 0 ? adjustSettings.trimEnd : undefined,
      speed: adjustSettings.speed,
      fadeIn: audioSettings.fadeIn,
      fadeOut: audioSettings.fadeOut,
    };

    const outputPath = await exportVideo(config);
    if (outputPath) {
      setExportedVideoPath(outputPath);
      setShowExportSheet(false);
      Alert.alert(
        'Videon Hazır!',
        'Videon başarıyla oluşturuldu ve galerine kaydedildi.',
        [{ 
          text: 'Harika!', 
        }]
      );
    }
  };

  if (!project) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Project not found</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={textPrimary} />
        </TouchableOpacity>
        <TextInput
          style={styles.projectName}
          value={projectName}
          onChangeText={handleNameChange}
          placeholder="Project Name"
          placeholderTextColor={textSecondary}
        />
        <TouchableOpacity style={[styles.exportButton, isTrimInvalid && styles.exportButtonDisabled]} onPress={() => !isTrimInvalid && setShowExportSheet(true)}>
          <Upload size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Video Player */}
      <VideoPlayer
        videoUri={project.processedVideoPath || project.originalVideoPath}
        exportedPath={exportedVideoPath}
        trimStart={adjustSettings.trimStart > 0 ? adjustSettings.trimStart : undefined}
        trimEnd={adjustSettings.trimEnd > 0 ? adjustSettings.trimEnd : undefined}
      />

      {/* Tool Bar */}
      <ToolBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'silence' && (
          <View style={styles.tabPanel}>
            <Toggle
              label="Auto Remove Silences"
              description="Automatically detect and remove silent parts"
              value={silenceSettings.threshold < -30}
              onValueChange={(v) => updateSilenceSettings({ threshold: v ? -40 : -20 })}
            />
            
            <View style={styles.divider} />
            
            <Text style={styles.sectionTitle}>Silence Detection</Text>
            
            <Slider
              label="Silence Threshold"
              value={silenceSettings.threshold}
              minimumValue={-60}
              maximumValue={-20}
              step={5}
              onValueChange={(v) => updateSilenceSettings({ threshold: v })}
              formatValue={(v) => `${v}dB`}
            />
            
            <Slider
              label="Min Silence Length"
              value={silenceSettings.minDuration}
              minimumValue={0.1}
              maximumValue={2.0}
              step={0.1}
              onValueChange={(v) => updateSilenceSettings({ minDuration: v })}
              formatValue={(v) => `${v}s`}
            />
            
            <Slider
              label="Keep Buffer"
              value={silenceSettings.padding}
              minimumValue={0}
              maximumValue={500}
              step={50}
              onValueChange={(v) => updateSilenceSettings({ padding: v })}
              formatValue={(v) => `${v}ms`}
            />

            <Button
              title="Detect Silences"
              onPress={detectSilences}
              style={styles.actionButton}
            />

            {silenceSegments.length > 0 && (
              <View style={styles.segmentsList}>
                <Text style={styles.sectionTitle}>Detected Silences ({silenceSegments.length})</Text>
                {silenceSegments.map((segment, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.segmentItem,
                      segment.excluded && styles.segmentExcluded,
                    ]}
                    onPress={() => toggleSilenceExcluded(index)}
                  >
                    <View style={styles.segmentInfo}>
                      <Text style={styles.segmentTime}>
                        {formatTime(segment.start)} - {formatTime(segment.end)}
                      </Text>
                      <Text style={styles.segmentDuration}>
                        ({segment.duration.toFixed(2)}s)
                      </Text>
                    </View>
                    {!segment.excluded && (
                      <View style={styles.checkIcon}>
                        <Check size={18} color="#4ADE80" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
                
                <Button
                  title="Apply Cuts"
                  onPress={applySilenceRemoval}
                  variant="primary"
                  style={styles.actionButton}
                />
              </View>
            )}
          </View>
        )}

        {activeTab === 'subtitles' && (
          <View style={styles.tabPanel}>
            <Toggle
              label="Auto Subtitles"
              description="Generate subtitles using AI transcription"
              value={subtitleSegments.length > 0}
              onValueChange={() => {}}
            />
            
            <View style={styles.divider} />
            
            <Text style={styles.sectionTitle}>Language</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.languageList}>
              {LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.languageItem,
                    selectedLanguage === lang.code && styles.languageItemActive,
                  ]}
                  onPress={() => setSelectedLanguage(lang.code)}
                >
                  <Text style={styles.languageFlag}>{lang.flag}</Text>
                  <Text style={[
                    styles.languageName,
                    selectedLanguage === lang.code && styles.languageNameActive,
                  ]}>
                    {lang.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Button
              title="Transcribe"
              onPress={() => transcribe(selectedLanguage)}
              style={styles.actionButton}
            />

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Style Presets</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsList}>
              {Object.entries(SUBTITLE_PRESETS).map(([key]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.presetItem,
                    subtitleStyle.preset === key && styles.presetItemActive,
                  ]}
                  onPress={() => handlePresetSelect(key)}
                >
                  <Text style={styles.presetName}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
                  {!canUseSubtitleStyle(key) && (
                    <LockIcon size={14} color={textSecondary} style={styles.lockIcon} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Size & Color</Text>
            <Slider
              label="Font Size"
              value={subtitleStyle.fontSize}
              minimumValue={20}
              maximumValue={150}
              step={2}
              onValueChange={(v) => setSubtitleStyle({ fontSize: v })}
              formatValue={(v) => `${v}px`}
            />

            <View style={styles.colorRow}>
              {['#FFFFFF', '#FCD34D', '#22D3EE', '#F87171', '#4ADE80', '#000000'].map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    subtitleStyle.textColor === color && styles.colorOptionActive,
                  ]}
                  onPress={() => setSubtitleStyle({ textColor: color })}
                />
              ))}
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Position</Text>
            <View style={styles.positionGrid}>
              {[
                { label: 'Top', value: 'top' },
                { label: 'Middle', value: 'middle' },
                { label: 'Bottom', value: 'bottom' },
              ].map((pos) => (
                <TouchableOpacity
                  key={pos.value}
                  style={[
                    styles.positionItem,
                    subtitleStyle.position === pos.value && styles.positionItemActive,
                  ]}
                  onPress={() => setSubtitleStyle({ position: pos.value as any })}
                >
                  <Text style={[
                      styles.positionLabel,
                      subtitleStyle.position === pos.value && styles.positionLabelActive
                  ]}>{pos.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Subtitles ({subtitleSegments.length})</Text>
            {subtitleSegments.map((segment) => (
              <View key={segment.id} style={styles.subtitleItem}>
                <Text style={styles.subtitleTime}>{formatTime(segment.start)}</Text>
                <TextInput
                  style={styles.subtitleText}
                  value={segment.text}
                  onChangeText={(text) => {
                    useEditorStore.getState().updateSubtitleText(segment.id, text);
                  }}
                  multiline
                />
              </View>
            ))}
          </View>
        )}

        {activeTab === 'audio' && (
          <View style={styles.tabPanel}>
            <Text style={styles.sectionTitle}>Original Audio</Text>
            <Slider
              label="Volume"
              value={audioSettings.originalVolume}
              minimumValue={0}
              maximumValue={150}
              step={10}
              onValueChange={(v) => updateAudioSettings({ originalVolume: v })}
              formatValue={(v) => `${v}%`}
            />

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Background Music</Text>
            <Toggle
              label="Enable Background Music"
              value={!!audioSettings.musicPath}
              onValueChange={(v) => {
                if (!v) {
                  updateAudioSettings({ musicPath: undefined });
                } else {
                  // Kullanıcı kendi müziğini seçmeli - şimdilik ilk track'i işaretle
                  // Gerçek path olmadığı için export sırasında atlanacak
                  updateAudioSettings({ musicPath: BACKGROUND_TRACKS[0].path });
                }
              }}
            />

            {audioSettings.musicPath && (
              <>
                <View style={styles.trackList}>
                  {BACKGROUND_TRACKS.map((track) => (
                    <TouchableOpacity
                      key={track.id}
                      style={[
                        styles.trackItem,
                        audioSettings.musicPath === track.path && styles.trackItemActive,
                      ]}
                      onPress={() => updateAudioSettings({ musicPath: track.path })}
                    >
                      <Text style={[
                        styles.trackName,
                        audioSettings.musicPath === track.path && styles.trackNameActive,
                      ]}>{track.name}</Text>
                      <Text style={styles.trackArtist}>{track.artist}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Slider
                  label="Music Volume"
                  value={audioSettings.musicVolume}
                  minimumValue={0}
                  maximumValue={100}
                  step={5}
                  onValueChange={(v) => updateAudioSettings({ musicVolume: v })}
                  formatValue={(v) => `${v}%`}
                />

                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Fade In</Text>
                  <Toggle
                    value={audioSettings.fadeIn}
                    onValueChange={(v) => updateAudioSettings({ fadeIn: v })}
                  />
                </View>

                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Fade Out</Text>
                  <Toggle
                    value={audioSettings.fadeOut}
                    onValueChange={(v) => updateAudioSettings({ fadeOut: v })}
                  />
                </View>
              </>
            )}
          </View>
        )}

        {activeTab === 'adjust' && (
          <View style={styles.tabPanel}>
            <Text style={styles.sectionTitle}>Aspect Ratio</Text>
            <View style={styles.aspectGrid}>
              {ASPECT_RATIOS.map((ratio) => (
                <TouchableOpacity
                  key={ratio.value}
                  style={[
                    styles.aspectItem,
                    adjustSettings.aspectRatio === ratio.value && styles.aspectItemActive,
                  ]}
                  onPress={() => updateAdjustSettings({ aspectRatio: ratio.value })}
                >
                  <Text style={styles.aspectLabel}>{ratio.label}</Text>
                  <Text style={styles.aspectDesc}>{ratio.description}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Playback Speed</Text>
            <View style={styles.speedGrid}>
              {SPEED_OPTIONS.map((speed) => (
                <TouchableOpacity
                  key={speed.label}
                  style={[
                    styles.speedItem,
                    adjustSettings.speed === speed.value && styles.speedItemActive,
                  ]}
                  onPress={() => updateAdjustSettings({ speed: speed.value as any })}
                >
                  <Text style={[
                    styles.speedLabel,
                    adjustSettings.speed === speed.value && styles.speedLabelActive,
                  ]}>
                    {speed.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Görsel Kırpma (Trim)</Text>
            
            {/* Visual Trim Slider */}
            <View style={styles.trimSliderContainer}>
              <View style={[styles.trimSliderBackground, { width: SLIDER_WIDTH }]} />
              
              {/* Range Indicator */}
              <View 
                style={[
                  styles.trimRangeIndicator, 
                  { 
                    left: (adjustSettings.trimStart / project.duration) * SLIDER_WIDTH,
                    width: ((adjustSettings.trimEnd || project.duration) - adjustSettings.trimStart) / project.duration * SLIDER_WIDTH 
                  }
                ]} 
              />

              {/* Start Handle */}
              <GestureDetector gesture={Gesture.Pan().onUpdate((e) => {
                const newTime = Math.max(0, Math.min((adjustSettings.trimEnd || project.duration) - 0.5, (e.x / SLIDER_WIDTH) * project.duration));
                runOnJS(updateAdjustSettings)({ trimStart: newTime });
              })}>
                <View style={[styles.trimHandle, { left: (adjustSettings.trimStart / project.duration) * SLIDER_WIDTH - 10 }]}>
                  <View style={styles.trimHandleBar} />
                </View>
              </GestureDetector>

              {/* End Handle */}
              <GestureDetector gesture={Gesture.Pan().onUpdate((e) => {
                const newTime = Math.max(adjustSettings.trimStart + 0.5, Math.min(project.duration, (e.x / SLIDER_WIDTH) * project.duration));
                runOnJS(updateAdjustSettings)({ trimEnd: newTime });
              })}>
                <View style={[styles.trimHandle, { left: ((adjustSettings.trimEnd || project.duration) / project.duration) * SLIDER_WIDTH - 10 }]}>
                  <View style={styles.trimHandleBar} />
                </View>
              </GestureDetector>
            </View>

            <View style={styles.trimRow}>
              <View style={styles.trimField}>
                <Text style={styles.trimLabel}>Başlangıç</Text>
                <TextInput
                  style={styles.trimInput}
                  value={formatTimeMsMs(adjustSettings.trimStart)}
                  onChangeText={(text) => {
                    const secs = parseTimeMsMs(text);
                    if (secs !== null) updateAdjustSettings({ trimStart: secs });
                  }}
                  keyboardType="numbers-and-punctuation"
                  placeholder="00:00.00"
                  placeholderTextColor={textSecondary}
                />
              </View>
              <View style={styles.trimField}>
                <Text style={styles.trimLabel}>Bitiş</Text>
                <TextInput
                  style={styles.trimInput}
                  value={formatTimeMsMs(adjustSettings.trimEnd || project.duration)}
                  onChangeText={(text) => {
                    const secs = parseTimeMsMs(text);
                    if (secs !== null) updateAdjustSettings({ trimEnd: secs });
                  }}
                  keyboardType="numbers-and-punctuation"
                  placeholder="00:00.00"
                  placeholderTextColor={textSecondary}
                />
              </View>
            </View>
            {isTrimInvalid && (
              <Text style={styles.trimError}>Geçersiz trim aralığı</Text>
            )}
          </View>
        )}
      </ScrollView>

      <Timeline duration={project.duration} />

      {/* Export Sheet */}
      {showExportSheet && (
        <Animated.View entering={FadeIn} style={styles.exportSheet}>
          <View style={styles.exportSheetContent}>
            <View style={styles.exportSheetHandle} />
            <Text style={styles.exportSheetTitle}>Export Video</Text>
            
            <Text style={styles.exportSectionTitle}>Platform</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.platformList}>
              {PLATFORM_PRESETS.map((preset) => (
                <TouchableOpacity key={preset.name} style={styles.platformItem}>
                  <Text style={styles.platformName}>{preset.name}</Text>
                  <Text style={styles.platformDesc}>{preset.description}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.exportSectionTitle}>Quality</Text>
            <View style={styles.qualityList}>
              {RESOLUTION_OPTIONS.map((res) => (
                <TouchableOpacity
                  key={res.value}
                  style={styles.qualityItem}
                  onPress={() => {
                    if (res.premium && !isPremium) {
                      router.push('/paywall');
                    }
                  }}
                >
                  <Text style={styles.qualityLabel}>{res.label}</Text>
                  {res.premium && !isPremium && (
                    <LockIcon size={16} color={textSecondary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <Button
              title="Save to Gallery"
              onPress={handleExport}
              size="large"
              style={[styles.exportButtonLarge, isTrimInvalid ? styles.exportButtonDisabled : undefined]}
              disabled={isTrimInvalid}
            />
            
            <TouchableOpacity
              style={styles.cancelExportButton}
              onPress={() => setShowExportSheet(false)}
            >
              <Text style={styles.cancelExportText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Loading Overlay */}
      <LoadingOverlay
        visible={isProcessing}
        progress={processingProgress}
        step={processingStep}
      />
    </KeyboardAvoidingView>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

/** Format seconds as mm:ss.ms (e.g. 65.5 → "01:05.50") */
function formatTimeMsMs(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

/** Parse mm:ss.ms or plain seconds string to seconds, returns null if invalid */
function parseTimeMsMs(text: string): number | null {
  // Try mm:ss.ms format
  const match = text.match(/^(\d{1,2}):(\d{2})\.(\d{2})$/);
  if (match) {
    const mins = parseInt(match[1], 10);
    const secs = parseInt(match[2], 10);
    const ms = parseInt(match[3], 10);
    if (secs >= 60 || ms > 99) return null;
    return mins * 60 + secs + ms / 100;
  }
  
  // Try plain seconds format (e.g. "5" or "5.5")
  const plainSecs = parseFloat(text);
  if (!isNaN(plainSecs) && plainSecs >= 0) {
    return plainSecs;
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    backgroundColor: background,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: textPrimary,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  exportButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContent: {
    flex: 1,
    backgroundColor: surface,
  },
  tabPanel: {
    padding: 20,
    gap: 16,
  },
  divider: {
    height: 1,
    backgroundColor: border,
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: textPrimary,
    marginBottom: 12,
  },
  actionButton: {
    marginTop: 8,
  },
  segmentsList: {
    gap: 8,
    marginTop: 8,
  },
  segmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: surfaceElevated,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: border,
  },
  segmentExcluded: {
    opacity: 0.5,
    borderColor: border,
  },
  segmentTime: {
    fontSize: 14,
    color: textPrimary,
    fontVariant: ['tabular-nums'],
  },
  segmentDuration: {
    fontSize: 13,
    color: textSecondary,
  },
  segmentInfo: {
    flex: 1,
  },
  checkIcon: {
    marginLeft: 12,
  },
  languageList: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: surfaceElevated,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: border,
  },
  languageItemActive: {
    borderColor: primary,
    backgroundColor: `${primary}20`,
  },
  languageFlag: {
    fontSize: 20,
  },
  languageName: {
    fontSize: 14,
    color: textSecondary,
  },
  languageNameActive: {
    color: primary,
    fontWeight: '600',
  },
  presetsList: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  presetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: surfaceElevated,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: border,
  },
  presetItemActive: {
    borderColor: primary,
    backgroundColor: `${primary}20`,
  },
  presetName: {
    fontSize: 14,
    color: textPrimary,
  },
  lockIcon: {
    marginLeft: 4,
  },
  subtitleItem: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: surfaceElevated,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  subtitleTime: {
    fontSize: 13,
    color: textSecondary,
    fontVariant: ['tabular-nums'],
    minWidth: 70,
  },
  subtitleText: {
    flex: 1,
    fontSize: 15,
    color: textPrimary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 15,
    color: textPrimary,
  },
  aspectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  aspectItem: {
    flex: 1,
    minWidth: 140,
    backgroundColor: surfaceElevated,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: border,
    alignItems: 'center',
  },
  aspectItemActive: {
    borderColor: primary,
    backgroundColor: `${primary}20`,
  },
  aspectLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: textPrimary,
    marginBottom: 4,
  },
  aspectDesc: {
    fontSize: 12,
    color: textSecondary,
    textAlign: 'center',
  },
  speedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  speedItem: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: border,
  },
  speedItemActive: {
    borderColor: primary,
    backgroundColor: `${primary}20`,
  },
  speedLabel: {
    fontSize: 15,
    color: textSecondary,
  },
  speedLabelActive: {
    color: primary,
    fontWeight: '600',
  },
  exportSheet: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  exportSheetContent: {
    backgroundColor: surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  exportSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  exportSheetTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: textPrimary,
    marginBottom: 20,
  },
  exportSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 16,
  },
  platformList: {
    flexDirection: 'row',
  },
  platformItem: {
    width: 140,
    backgroundColor: surfaceElevated,
    padding: 16,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: border,
  },
  platformName: {
    fontSize: 16,
    fontWeight: '600',
    color: textPrimary,
    marginBottom: 4,
  },
  platformDesc: {
    fontSize: 12,
    color: textSecondary,
  },
  qualityList: {
    gap: 8,
  },
  qualityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: surfaceElevated,
    padding: 16,
    borderRadius: 12,
  },
  qualityLabel: {
    fontSize: 16,
    color: textPrimary,
  },
  exportButtonLarge: {
    marginTop: 24,
  },
  cancelExportButton: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  cancelExportText: {
    fontSize: 16,
    color: textSecondary,
  },
  errorText: {
    fontSize: 18,
    color: Colors.danger,
    textAlign: 'center',
    marginTop: 100,
  },
  exportButtonDisabled: {
    opacity: 0.4,
  },
  trimRow: {
    flexDirection: 'row',
    gap: 12,
  },
  trimField: {
    flex: 1,
    gap: 6,
  },
  trimLabel: {
    fontSize: 13,
    color: textSecondary,
    fontWeight: '500',
  },
  trimInput: {
    backgroundColor: surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: textPrimary,
    fontVariant: ['tabular-nums'],
  },
  trimError: {
    fontSize: 13,
    color: Colors.danger,
    marginTop: 4,
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  colorOption: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionActive: {
    borderColor: primary,
  },
  positionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  positionItem: {
    flex: 1,
    backgroundColor: surfaceElevated,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: border,
  },
  positionItemActive: {
    backgroundColor: `${primary}20`,
    borderColor: primary,
  },
  positionLabel: {
    color: textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  positionLabelActive: {
    color: primary,
  },
  colorLabelActive: {
    color: primary,
  },
  trimSliderContainer: {
    height: 50,
    marginTop: 16,
    marginBottom: 24,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  trimSliderBackground: {
    height: 6,
    backgroundColor: border,
    borderRadius: 3,
  },
  trimRangeIndicator: {
    position: 'absolute',
    height: 6,
    backgroundColor: primary,
    borderRadius: 3,
    top: 22,
  },
  trimHandle: {
    position: 'absolute',
    width: 24,
    height: 38,
    backgroundColor: 'white',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    top: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    zIndex: 100,
  },
  trimHandleBar: {
    width: 2,
    height: 18,
    backgroundColor: Colors.border,
    borderRadius: 1,
  },
  trackList: {
    gap: 8,
    marginBottom: 8,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: surfaceElevated,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: border,
  },
  trackItemActive: {
    borderColor: primary,
    backgroundColor: `${primary}20`,
  },
  trackName: {
    fontSize: 14,
    color: textPrimary,
    fontWeight: '500',
  },
  trackNameActive: {
    color: primary,
  },
  trackArtist: {
    fontSize: 12,
    color: textSecondary,
  },
});
