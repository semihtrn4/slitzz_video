import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  FadeIn,
  FadeInUp,
} from 'react-native-reanimated';
import {
  Video,
  Scissors,
  Type,
  ChevronRight,
} from 'lucide-react-native';

import { Colors } from '@/src/constants/colors';

const { width, height } = Dimensions.get('window');
const { background, surface, primary, textPrimary, textSecondary } = Colors;

const ONBOARDING_STEPS = [
  {
    id: '1',
    icon: Video,
    title: 'Record or Import',
    description: 'Import videos from your gallery or files. Supports MP4, MOV, and M4V formats.',
    color: '#7C3AED',
  },
  {
    id: '2',
    icon: Scissors,
    title: 'Auto-Remove Silences',
    description: 'Our AI automatically detects and removes awkward pauses to keep your content engaging.',
    color: '#10B981',
  },
  {
    id: '3',
    icon: Type,
    title: 'Viral Subtitles',
    description: 'Generate accurate subtitles with one tap. Choose from viral styles like TikTok, Netflix, and more.',
    color: '#F59E0B',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleComplete = async () => {
    void AsyncStorage.setItem('onboarding_completed', 'true');
    router.replace('/(tabs)');
  };

  const handleSkip = async () => {
    void AsyncStorage.setItem('onboarding_completed', 'true');
    router.replace('/(tabs)');
  };

  const handleNext = () => {
    if (currentIndex < ONBOARDING_STEPS.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
      setCurrentIndex(currentIndex + 1);
    } else {
      void handleComplete();
    }
  };

  const renderItem = ({ item, index }: { item: typeof ONBOARDING_STEPS[0]; index: number }) => {
    const Icon = item.icon;
    
    return (
      <View style={styles.slide}>
        <Animated.View 
          entering={FadeInUp.delay(index * 200)}
          style={[styles.iconContainer, { backgroundColor: `${item.color}20` }]}
        >
          <Icon size={64} color={item.color} />
        </Animated.View>
        
        <Animated.View entering={FadeInUp.delay(index * 200 + 100)}>
          <Text style={styles.title}>{item.title}</Text>
        </Animated.View>
        
        <Animated.View entering={FadeInUp.delay(index * 200 + 200)}>
          <Text style={styles.description}>{item.description}</Text>
        </Animated.View>
      </View>
    );
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    if (viewableItems[0]?.index !== null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  return (
    <View style={styles.container}>
      {/* Skip Button */}
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Carousel */}
      <FlatList
        ref={flatListRef}
        data={ONBOARDING_STEPS}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
      />

      {/* Pagination Dots */}
      <View style={styles.pagination}>
        {ONBOARDING_STEPS.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index === currentIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* Bottom Section */}
      <Animated.View entering={FadeIn.delay(400)} style={styles.bottomContainer}>
        {currentIndex === ONBOARDING_STEPS.length - 1 ? (
          <TouchableOpacity style={styles.getStartedButton} onPress={handleComplete}>
            <Text style={styles.getStartedText}>Get Started</Text>
            <ChevronRight size={20} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>Next</Text>
            <ChevronRight size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: background,
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    padding: 12,
  },
  skipText: {
    fontSize: 16,
    color: textSecondary,
    fontWeight: '500',
  },
  slide: {
    width,
    height: height * 0.6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 17,
    color: textSecondary,
    textAlign: 'center',
    lineHeight: 26,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 40,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: `${primary}40`,
  },
  dotActive: {
    width: 24,
    backgroundColor: primary,
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surface,
    borderRadius: 16,
    paddingVertical: 18,
    gap: 8,
  },
  nextButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: textPrimary,
  },
  getStartedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: primary,
    borderRadius: 16,
    paddingVertical: 18,
    gap: 8,
  },
  getStartedText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
