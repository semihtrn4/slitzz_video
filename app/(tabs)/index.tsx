import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import {
  Plus,
  Film,
  Clock,
  Zap,
} from 'lucide-react-native';
import { format } from 'date-fns';

import { Colors } from '@/src/constants/colors';
import { useProjectStore } from '@/src/stores/projectStore';
import { useSubscriptionStore } from '@/src/stores/subscriptionStore';
import type { Project } from '@/src/types';

const { background, surface, surfaceElevated, primary, textPrimary, textSecondary, border, success } = Colors;

export default function HomeScreen() {
  const router = useRouter();
  const { projects, deleteProject, duplicateProject, setCurrentProject } = useProjectStore();
  const { isPremium, canCreateProject } = useSubscriptionStore();
  
  const [_selectedProject, setSelectedProject] = useState<Project | null>(null);

  const handleCreateProject = () => {
    if (!canCreateProject(projects.length)) {
      Alert.alert(
        'Free Plan Limit',
        'You\'ve reached the maximum number of projects on the free plan. Upgrade to Premium for unlimited projects.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/paywall') },
        ]
      );
      return;
    }
    router.push('/(tabs)/create');
  };

  const handleProjectPress = (project: Project) => {
    setCurrentProject(project.id);
    router.push(`/editor/${project.id}`);
  };

  const handleLongPress = (project: Project) => {
    setSelectedProject(project);
    Alert.alert(
      project.name,
      'Choose an action',
      [
        { 
          text: 'Rename', 
          onPress: () => {
            // Show rename dialog
          }
        },
        { 
          text: 'Duplicate', 
          onPress: () => duplicateProject(project.id)
        },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete Project',
              `Are you sure you want to delete "${project.name}"? This action cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Delete', 
                  style: 'destructive',
                  onPress: () => deleteProject(project.id)
                },
              ]
            );
          }
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const renderProjectCard = ({ item, index }: { item: Project; index: number }) => {
    return (
    <Animated.View entering={FadeInUp.delay(index * 100)}>
      <TouchableOpacity
        style={styles.projectCard}
        onPress={() => handleProjectPress(item)}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.8}
      >
        <View style={styles.thumbnailContainer}>
          {item.thumbnailPath ? (
            <Image source={{ uri: item.thumbnailPath }} style={styles.thumbnail} />
          ) : (
            <View style={styles.thumbnailPlaceholder}>
              <Film size={32} color={textSecondary} />
            </View>
          )}
          <View style={styles.durationBadge}>
            <Clock size={12} color="#FFFFFF" />
            <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
          </View>
        </View>
        <View style={styles.projectInfo}>
          <Text style={styles.projectName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.projectDate}>
            {format(new Date(item.createdAt), 'MMM d, yyyy')}
          </Text>
          <View style={styles.statusContainer}>
            <View style={[styles.statusBadge, item.status === 'exported' && styles.statusBadgeExported]}>
              <Text style={[styles.statusText, item.status === 'exported' && styles.statusTextExported]}>
                {item.status === 'draft' ? 'Draft' : 'Exported'}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
    );
  };

  const renderEmptyState = () => (
    <Animated.View entering={FadeIn} style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Zap size={48} color={primary} />
      </View>
      <Text style={styles.emptyTitle}>No Projects Yet</Text>
      <Text style={styles.emptySubtitle}>
        Import your first video to start editing with BlitzCut
      </Text>
      <TouchableOpacity style={styles.emptyButton} onPress={handleCreateProject}>
        <Plus size={20} color="#FFFFFF" />
        <Text style={styles.emptyButtonText}>İlk videonu içe aktar</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <Animated.View entering={FadeIn} style={styles.header}>
        <View>
          <Text style={styles.logo}>BlitzCut</Text>
          <Text style={styles.tagline}>Edit videos like a pro</Text>
        </View>
        <TouchableOpacity style={styles.createButton} onPress={handleCreateProject}>
          <Plus size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>

      {/* Content */}
      {projects.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={projects}
          renderItem={renderProjectCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              Recent Projects ({projects.length})
            </Text>
          }
          ListFooterComponent={
            <TouchableOpacity style={styles.newProjectButton} onPress={handleCreateProject}>
              <Plus size={20} color={primary} />
              <Text style={styles.newProjectText}>Start New Project</Text>
            </TouchableOpacity>
          }
        />
      )}

      {/* Premium Banner */}
      {!isPremium && (
        <Animated.View entering={FadeInUp.delay(500)} style={styles.premiumBanner}>
          <View style={styles.premiumContent}>
            <Text style={styles.premiumTitle}>Go Premium</Text>
            <Text style={styles.premiumSubtitle}>
              Unlimited projects, no watermark, 4K export
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.premiumButton}
            onPress={() => router.push('/paywall')}
          >
            <Text style={styles.premiumButtonText}>Upgrade</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  logo: {
    fontSize: 28,
    fontWeight: 'bold',
    color: textPrimary,
  },
  tagline: {
    fontSize: 14,
    color: textSecondary,
    marginTop: 2,
  },
  createButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 20,
    gap: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: textPrimary,
    marginBottom: 8,
  },
  projectCard: {
    flexDirection: 'row',
    backgroundColor: surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: border,
    marginBottom: 12,
  },
  thumbnailContainer: {
    width: 100,
    height: 100,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  durationText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  projectInfo: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  projectName: {
    fontSize: 17,
    fontWeight: '600',
    color: textPrimary,
    marginBottom: 4,
  },
  projectDate: {
    fontSize: 13,
    color: textSecondary,
    marginBottom: 8,
  },
  statusContainer: {
    flexDirection: 'row',
  },
  statusBadge: {
    backgroundColor: `${primary}20`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeExported: {
    backgroundColor: `${success}20`,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: primary,
  },
  statusTextExported: {
    color: success,
  },
  newProjectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: primary,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 20,
    marginTop: 8,
  },
  newProjectText: {
    fontSize: 16,
    fontWeight: '600',
    color: primary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: `${primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: primary,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
  },
  emptyButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: surface,
    marginHorizontal: 20,
    marginBottom: 100,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: primary,
  },
  premiumContent: {
    flex: 1,
  },
  premiumTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: textPrimary,
    marginBottom: 4,
  },
  premiumSubtitle: {
    fontSize: 13,
    color: textSecondary,
  },
  premiumButton: {
    backgroundColor: primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  premiumButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
