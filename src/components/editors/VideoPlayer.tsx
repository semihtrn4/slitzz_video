import { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions, Text } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus, AVPlaybackStatusSuccess } from 'expo-av';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Play, Download, Share2 } from 'lucide-react-native';

import { Colors } from '@/src/constants/colors';
import { useEditorStore } from '@/src/stores/editorStore';
import { SubtitlePreview } from './SubtitlePreview';
import { mediaService } from '../../services/mediaService';

const { width } = Dimensions.get('window');

interface VideoPlayerProps {
  videoUri: string;
  exportedPath?: string;
  trimStart?: number;
  trimEnd?: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function isLoaded(status: AVPlaybackStatus): status is AVPlaybackStatusSuccess {
  return status.isLoaded;
}

export function VideoPlayer({ videoUri, exportedPath, trimStart, trimEnd }: VideoPlayerProps) {
  const {
    isPlaying,
    setIsPlaying,
    playbackPosition,
    setPlaybackPosition,
    subtitleSegments,
    subtitleStyle,
  } = useEditorStore();

  const videoRef = useRef<Video>(null);
  const [totalDuration, setTotalDuration] = useState(0);

  // Sync play/pause from store → player
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.playAsync();
    } else {
      videoRef.current.pauseAsync();
    }
  }, [isPlaying]);

  const handlePlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!isLoaded(status)) return;

      if (status.durationMillis) {
        setTotalDuration(status.durationMillis / 1000);
      }

      const current = (status.positionMillis ?? 0) / 1000;
      setPlaybackPosition(current);

      // Trim boundary
      if (trimEnd !== undefined && trimEnd > 0 && current >= trimEnd) {
        videoRef.current?.pauseAsync();
        setIsPlaying(false);
        const seekTo = (trimStart ?? 0) * 1000;
        videoRef.current?.setPositionAsync(seekTo);
        setPlaybackPosition(trimStart ?? 0);
      }

      // Sync finished state
      if (status.didJustFinish) {
        setIsPlaying(false);
      }
    },
    [setPlaybackPosition, setIsPlaying, trimStart, trimEnd]
  );

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const currentSubtitle = subtitleSegments.find(
    (seg) => playbackPosition >= seg.start && playbackPosition <= seg.end
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={togglePlayPause}
        style={styles.videoContainer}
      >
        <Video
          ref={videoRef}
          source={{ uri: videoUri }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          isLooping
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          useNativeControls={false}
        />

        {currentSubtitle && (
          <Animated.View entering={FadeIn} style={styles.subtitleContainer}>
            <SubtitlePreview text={currentSubtitle.text} style={subtitleStyle} />
          </Animated.View>
        )}

        {/* Time overlay — bottom left */}
        <View style={styles.timeOverlay}>
          <Text style={styles.timeText}>
            {formatTime(playbackPosition)} / {formatTime(totalDuration)}
          </Text>
        </View>

        {!isPlaying && (
          <Animated.View entering={FadeIn} style={styles.playOverlay}>
            <View style={styles.playButton}>
              <Play size={32} color="#FFFFFF" fill="#FFFFFF" />
            </View>
          </Animated.View>
        )}
      </TouchableOpacity>

      {/* Export action buttons */}
      {exportedPath && (
        <View style={styles.exportButtons}>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => mediaService.saveToLibrary(exportedPath)}
          >
            <Download size={18} color={Colors.textPrimary} />
            <Text style={styles.exportButtonText}>Kamera Rulosuna Kaydet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => mediaService.share(exportedPath)}
          >
            <Share2 size={18} color={Colors.textPrimary} />
            <Text style={styles.exportButtonText}>Paylaş</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
  },
  videoContainer: {
    width: width,
    height: Math.min((width * 16) / 9, Dimensions.get('window').height * 0.4),
    backgroundColor: '#000000',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  subtitleContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  timeOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportButtons: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  exportButtonText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
});
