import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import {
  X,
  Crown,
  Check,
  Sparkles,
  Scissors,
  Type,
  Music,
  Download,
} from 'lucide-react-native';

import { Colors } from '@/src/constants/colors';
import { PRICING } from '@/src/constants/exportPresets';
import { useSubscriptionStore } from '@/src/stores/subscriptionStore';

const { background, surface, primary, primaryLight, textPrimary, textSecondary, border, success } = Colors;

const FEATURES = [
  { icon: Scissors, text: 'Unlimited silence removal' },
  { icon: Type, text: 'All subtitle styles & fonts' },
  { icon: Sparkles, text: 'No watermark on exports' },
  { icon: Music, text: 'Full music library' },
  { icon: Download, text: 'All export quality options' },
];

export default function PaywallScreen() {
  const router = useRouter();
  const { setPlan, setPremium } = useSubscriptionStore();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');

  const handleClose = () => {
    router.back();
  };

  const handleSubscribe = () => {
    // Mock subscription - in real app, integrate with App Store / Play Store
    setPlan(selectedPlan);
    setPremium(true);
    Alert.alert(
      'Success!',
      `You've upgraded to the ${selectedPlan} plan. Enjoy all premium features!`,
      [{ text: 'Awesome!', onPress: () => router.back() }]
    );
  };

  const handleRestore = () => {
    Alert.alert('Restore Purchases', 'Checking for existing purchases...', [
      { text: 'OK' },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Close Button */}
      <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
        <X size={24} color={textPrimary} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeIn} style={styles.header}>
          <View style={styles.iconContainer}>
            <Crown size={40} color={primary} />
          </View>
          <Text style={styles.title}>Go Premium</Text>
          <Text style={styles.subtitle}>
            Unlock the full power of BlitzCut
          </Text>
        </Animated.View>

        {/* Features */}
        <Animated.View entering={FadeInUp.delay(200)} style={styles.featuresContainer}>
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <View key={index} style={styles.featureItem}>
                <View style={styles.featureIcon}>
                  <Icon size={18} color={primary} />
                </View>
                <Text style={styles.featureText}>{feature.text}</Text>
                <Check size={18} color={success} />
              </View>
            );
          })}
        </Animated.View>

        {/* Plans */}
        <Animated.View entering={FadeInUp.delay(300)} style={styles.plansContainer}>
          {/* Monthly Plan */}
          <TouchableOpacity
            style={[
              styles.planCard,
              selectedPlan === 'monthly' && styles.planCardSelected,
            ]}
            onPress={() => setSelectedPlan('monthly')}
          >
            <View style={styles.planHeader}>
              <Text style={styles.planName}>{PRICING.monthly.label}</Text>
              {selectedPlan === 'monthly' && (
                <View style={styles.selectedIndicator}>
                  <Check size={16} color="#FFFFFF" />
                </View>
              )}
            </View>
            <View style={styles.priceContainer}>
              <Text style={styles.price}>${PRICING.monthly.price}</Text>
              <Text style={styles.period}>/{PRICING.monthly.period}</Text>
            </View>
          </TouchableOpacity>

          {/* Yearly Plan */}
          <TouchableOpacity
            style={[
              styles.planCard,
              selectedPlan === 'yearly' && styles.planCardSelected,
            ]}
            onPress={() => setSelectedPlan('yearly')}
          >
            <View style={styles.bestValueBadge}>
              <Text style={styles.bestValueText}>BEST VALUE</Text>
            </View>
            <View style={styles.planHeader}>
              <Text style={styles.planName}>{PRICING.yearly.label}</Text>
              {selectedPlan === 'yearly' && (
                <View style={styles.selectedIndicator}>
                  <Check size={16} color="#FFFFFF" />
                </View>
              )}
            </View>
            <View style={styles.priceContainer}>
              <Text style={styles.price}>${PRICING.yearly.price}</Text>
              <Text style={styles.period}>/{PRICING.yearly.period}</Text>
            </View>
            <View style={styles.savingsContainer}>
              <Text style={styles.savingsText}>Save {PRICING.yearly.savings}</Text>
            </View>
            <View style={styles.trialBadge}>
              <Text style={styles.trialText}>{PRICING.yearly.trialDays}-day free trial</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* CTA */}
        <Animated.View entering={FadeInUp.delay(400)} style={styles.ctaContainer}>
          <TouchableOpacity style={styles.subscribeButton} onPress={handleSubscribe}>
            <LinearGradient
              colors={[primary, primaryLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradient}
            >
              <Text style={styles.subscribeText}>
                Continue with {selectedPlan === 'monthly' ? 'Monthly' : 'Yearly'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.restoreButton} onPress={handleRestore}>
            <Text style={styles.restoreText}>Restore Purchases</Text>
          </TouchableOpacity>

          <View style={styles.termsContainer}>
            <Text style={styles.termsText}>
              By subscribing, you agree to our{' '}
              <Text style={styles.termsLink}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: background,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingTop: 100,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: textSecondary,
    textAlign: 'center',
  },
  featuresContainer: {
    backgroundColor: surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: border,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureText: {
    flex: 1,
    fontSize: 16,
    color: textPrimary,
  },
  plansContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  planCard: {
    flex: 1,
    backgroundColor: surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: border,
  },
  planCardSelected: {
    borderColor: primary,
    backgroundColor: `${primary}10`,
  },
  bestValueBadge: {
    position: 'absolute',
    top: -10,
    right: 12,
    backgroundColor: success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  bestValueText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
    color: textPrimary,
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  price: {
    fontSize: 28,
    fontWeight: 'bold',
    color: textPrimary,
  },
  period: {
    fontSize: 16,
    color: textSecondary,
  },
  savingsContainer: {
    backgroundColor: `${success}20`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  savingsText: {
    fontSize: 12,
    fontWeight: '600',
    color: success,
  },
  trialBadge: {
    marginTop: 8,
  },
  trialText: {
    fontSize: 13,
    color: primary,
    fontWeight: '500',
  },
  ctaContainer: {
    gap: 16,
  },
  subscribeButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  subscribeText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  restoreText: {
    fontSize: 15,
    color: textSecondary,
    textDecorationLine: 'underline',
  },
  termsContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  termsText: {
    fontSize: 12,
    color: textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: primary,
  },
});
