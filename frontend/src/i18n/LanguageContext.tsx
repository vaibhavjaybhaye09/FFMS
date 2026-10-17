import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language } from './translations';
import { getLanguage, saveLanguage, getUser } from '../storage/token';
import apiClient from '../api/client';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: async () => {},
  t: (key: string, fallback?: string) => fallback || key,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    const initLanguage = async () => {
      try {
        const stored = await getLanguage();
        if (stored === 'mr' || stored === 'hi' || stored === 'en') {
          setLanguageState(stored);
          return;
        }
        // Fallback: check if logged-in user profile has preferred language
        const user = await getUser();
        if (user?.language && (user.language === 'mr' || user.language === 'hi' || user.language === 'en')) {
          setLanguageState(user.language);
          await saveLanguage(user.language);
        } else {
          setLanguageState('en');
        }
      } catch (err) {
        console.error('Failed to load language', err);
        setLanguageState('en');
      }
    };

    initLanguage();
  }, []);

  const setLanguage = async (newLang: Language) => {
    try {
      setLanguageState(newLang);
      await saveLanguage(newLang);
      // Attempt backend sync if authenticated
      apiClient.post('/api/user/language/', { language: newLang }).catch(() => {
        // Silently catch if user is not yet logged in or offline
      });
    } catch (err) {
      console.error('Error saving language preference', err);
    }
  };

  const t = (key: string, fallback?: string): string => {
    const dict = translations[language] || translations.en;
    if (dict && dict[key] !== undefined) {
      return dict[key];
    }
    // Fallback to English dictionary
    if (translations.en && translations.en[key] !== undefined) {
      return translations.en[key];
    }
    return fallback !== undefined ? fallback : key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => useContext(LanguageContext);
