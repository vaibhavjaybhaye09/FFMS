import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../i18n/LanguageContext';
import { Language } from '../i18n/translations';

interface Props {
  onLanguageChanged?: (lang: Language) => void;
}

export const LanguageSelectorCard: React.FC<Props> = ({ onLanguageChanged }) => {
  const { language, setLanguage, t } = useTranslation();

  const options: { code: Language; label: string; sub: string; flag: string }[] = [
    { code: 'en', label: 'English', sub: 'Default', flag: '🇬🇧' },
    { code: 'mr', label: 'मराठी', sub: 'Marathi', flag: '🇮🇳' },
    { code: 'hi', label: 'हिंदी', sub: 'Hindi', flag: '🇮🇳' },
  ];

  const handleSelect = async (code: Language) => {
    if (code === language) return;
    await setLanguage(code);
    if (onLanguageChanged) {
      onLanguageChanged(code);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="globe-outline" size={20} color="#0284C7" />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.title}>{t('language_setting_title', 'Display Language')}</Text>
          <Text style={styles.subtitle}>
            {t('language_setting_sub', 'Choose your preferred language for the app interface')}
          </Text>
        </View>
      </View>

      <View style={styles.optionsList}>
        {options.map((opt) => {
          const isSelected = language === opt.code;
          return (
            <TouchableOpacity
              key={opt.code}
              style={[styles.optionRow, isSelected && styles.optionRowActive]}
              onPress={() => handleSelect(opt.code)}
              activeOpacity={0.8}
            >
              <View style={styles.optionLeft}>
                <Text style={styles.flag}>{opt.flag}</Text>
                <View style={{ marginLeft: 12 }}>
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.optionSub}>{opt.sub}</Text>
                </View>
              </View>

              <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                {isSelected && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  optionsList: {
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  optionRowActive: {
    backgroundColor: '#F0F9FF',
    borderColor: '#0284C7',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flag: {
    fontSize: 18,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  optionLabelActive: {
    color: '#0284C7',
    fontWeight: '900',
  },
  optionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#94A3B8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleActive: {
    borderColor: '#0284C7',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0284C7',
  },
});
