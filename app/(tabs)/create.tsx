import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
const documentDirectory = (FileSystem as any).documentDirectory;
const cacheDirectory = (FileSystem as any).cacheDirectory;
import { getPath } from '@/src/utils/pathUtils';
import {
  Image as ImageIcon,
  FileUp,
  Video,
  ChevronRight,
} from 'lucide-react-native';

import { Colors } from '@/src/constants/colors';
import { useProjectStore } from '@/src/stores/projectStore';
import { useSubscriptionStore } from '@/src/stores/subscriptionStore';
import { ffmpegService } from '@/src/services/ffmpegService';

const { surface, surfaceElevated, primary, textPrimary, textSecondary, border } = Colors;

export default function CreateScreen() {
  const router = useRouter();
  const addProject = useProjectStore((state) => state.addProject);
  const projects = useProjectStore((state) => state.projects);
  const canCreateProject = useSubscriptionStore((state) => state.canCreateProject);
  
  const [selectedVideo, setSelectedVideo] = useState<{
    uri: string;
    name: string;
    duration: number;
    size: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const fileInfo = await FileSystem.getInfoAsync(asset.uri);

        // FIX #14: expo-image-picker duration milisaniye döndürür, saniyeye çevir
        const durationMs = asset.duration ?? 0;
        const durationSec = durationMs > 1000 ? durationMs / 1000 : durationMs;

        setSelectedVideo({
          uri: asset.uri,
          name: asset.fileName || 'video.mp4',
          duration: durationSec,
          size: fileInfo.exists ? fileInfo.size : 0,
        });
      }
    } catch (error: any) {
      console.error('Error picking video:', error);
      Alert.alert('Error', `Failed to pick video: ${error.message || 'Unknown error'}`);
    }
  };

  const pickFromFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['video/mp4', 'video/quicktime', 'video/x-m4v'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const fileInfo = await FileSystem.getInfoAsync(asset.uri);
        
        // Get video duration using FFmpeg
        const videoInfo = await ffmpegService.getVideoInfo(asset.uri);
        
        setSelectedVideo({
          uri: asset.uri,
          name: asset.name,
          duration: videoInfo.duration,
          size: fileInfo.exists ? fileInfo.size : 0,
        });
      }
    } catch (error: any) {
      console.error('Error picking document:', error);
      Alert.alert('Error', `Failed to import video: ${error.message || 'Unknown error'}`);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleContinue = async () => {
    if (!selectedVideo) return;

    // Check free plan project limit before creating
    if (!canCreateProject(projects.length)) {
      router.push('/paywall');
      return;
    }

    setIsLoading(true);
    try {
      // Copy video to app directory
      const projectsDir = getPath(documentDirectory, 'projects/');
      const dirInfo = await FileSystem.getInfoAsync(projectsDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(projectsDir, { intermediates: true });
      }

      const fileName = `project_${Date.now()}.mp4`;
      const destUri = getPath(projectsDir, fileName);
      
      console.log('[Create] Copying from:', selectedVideo.uri, 'to:', destUri);
      await FileSystem.copyAsync({
        from: selectedVideo.uri,
        to: destUri
      });

      // Generate thumbnail
      const thumbnailPath = await ffmpegService.generateThumbnail(destUri, 0);

      // Create project
      const projectId = addProject({
        name: selectedVideo.name.replace(/\.[^/.]+$/, ''),
        originalVideoPath: destUri,
        thumbnailPath,
        duration: selectedVideo.duration,
        status: 'draft',
      });

      // Navigate to editor
      router.push(`/editor/${projectId}`);
    } catch (error: any) {
      console.error('Error creating project:', error);
      Alert.alert('Error', `Failed to create project: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Create New Project</Text>
      <Text style={styles.subtitle}>Import a video to start editing</Text>

      {!selectedVideo ? (
        <>
          <TouchableOpacity
            style={styles.importButton}
            onPress={pickFromGallery}
            testID="gallery-button"
          >
            <View style={styles.importIconContainer}>
              <ImageIcon size={32} color={primary} />
            </View>
            <View style={styles.importTextContainer}>
              <Text style={styles.importTitle}>Choose from Gallery</Text>
              <Text style={styles.importSubtitle}>
                Select a video from your photo library
              </Text>
            </View>
            <ChevronRight size={24} color={textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.importButton}
            onPress={pickFromFiles}
            testID="files-button"
          >
            <View style={[styles.importIconContainer, { backgroundColor: `${Colors.success}20` }]}>
              <FileUp size={32} color={Colors.success} />
            </View>
            <View style={styles.importTextContainer}>
              <Text style={styles.importTitle}>Import File</Text>
              <Text style={styles.importSubtitle}>
                Import MP4, MOV, or M4V from files
              </Text>
            </View>
            <ChevronRight size={24} color={textSecondary} />
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.previewContainer}>
          <View style={styles.videoPreview}>
            <Video size={48} color={primary} />
            <Text style={styles.videoName} numberOfLines={1}>
              {selectedVideo.name}
            </Text>
          </View>

          <View style={styles.infoContainer}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Duration</Text>
              <Text style={styles.infoValue}>
                {formatDuration(selectedVideo.duration)}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Size</Text>
              <Text style={styles.infoValue}>
                {formatSize(selectedVideo.size)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.changeButton}
            onPress={() => setSelectedVideo(null)}
            testID="change-video-button"
          >
            <Text style={styles.changeButtonText}>Choose Different Video</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.continueButton, isLoading && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={isLoading}
            testID="continue-button"
          >
            <Text style={styles.continueButtonText}>
              {isLoading ? 'Creating Project...' : 'Continue to Editor'}
            </Text>
            <ChevronRight size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.supportedFormats}>
        <Text style={styles.supportedTitle}>Supported Formats</Text>
        <Text style={styles.supportedText}>MP4, MOV, M4V • Max 4GB</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: textPrimary,
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: textSecondary,
    marginBottom: 20,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: border,
  },
  importIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: `${primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  importTextContainer: {
    flex: 1,
  },
  importTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: textPrimary,
    marginBottom: 4,
  },
  importSubtitle: {
    fontSize: 14,
    color: textSecondary,
  },
  previewContainer: {
    backgroundColor: surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: border,
  },
  videoPreview: {
    backgroundColor: surfaceElevated,
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    marginBottom: 20,
  },
  videoName: {
    fontSize: 16,
    fontWeight: '600',
    color: textPrimary,
    marginTop: 12,
  },
  infoContainer: {
    backgroundColor: surfaceElevated,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  divider: {
    height: 1,
    backgroundColor: border,
  },
  infoLabel: {
    fontSize: 15,
    color: textSecondary,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: textPrimary,
  },
  changeButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  changeButtonText: {
    fontSize: 15,
    color: textSecondary,
    textDecorationLine: 'underline',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: primary,
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  supportedFormats: {
    marginTop: 20,
    alignItems: 'center',
  },
  supportedTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  supportedText: {
    fontSize: 13,
    color: textSecondary,
  },
});
