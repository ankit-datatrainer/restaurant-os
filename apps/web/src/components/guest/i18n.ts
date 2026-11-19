'use client';

import * as React from 'react';
import type { MenuCategory, MenuItem } from '@restaurant-os/shared';
import { useTable } from './table-provider';

/**
 * Guest-side language switch (English / Hindi).
 *
 * - English strings are the source keys: `t('View order')` returns the key itself in English mode,
 *   and the Hindi entry (falling back to the key) in Hindi mode. `{name}` placeholders are filled in.
 * - The choice is per device (localStorage `ros:lang`), read in an effect so the server markup
 *   always matches the first client render (English).
 * - Hindi is only offered when the restaurant wrote at least one Hindi dish or category name.
 * - Dish option names/choices, prices and the WhatsApp consent sentence are never translated.
 */

export type Lang = 'en' | 'hi';
export const LANG_STORAGE_KEY = 'ros:lang';

/** Devanagari must not be letter-spaced, set in the Latin mono face or upper-cased. Add to any mono/uppercase label that can turn Hindi. */
export const HI_SAFE = '[&:lang(hi)]:font-sans [&:lang(hi)]:normal-case [&:lang(hi)]:tracking-normal';

const HI: Record<string, string> = {
  // Menu header
  'Search dishes': 'व्यंजन खोजें',
  'Search the menu': 'मेन्यू में खोजें',
  'Close search': 'खोज बंद करें',
  'My orders': 'मेरे ऑर्डर',
  'My orders, {n} placed': 'मेरे ऑर्डर, {n} किए गए',
  'Veg only': 'केवल शाकाहारी',
  'Show vegetarian dishes only': 'केवल शाकाहारी व्यंजन दिखाएँ',
  'Menu language': 'मेन्यू की भाषा',
  'Show the menu in English': 'मेन्यू अंग्रेज़ी में दिखाएँ',
  'Show the menu in Hindi': 'मेन्यू हिंदी में दिखाएँ',

  // Menu screen
  '{dishes} dishes · {categories} categories': '{dishes} व्यंजन · {categories} श्रेणियाँ',
  'Order from your phone. We will bring it over.': 'अपने फ़ोन से ऑर्डर करें। हम टेबल पर ले आएँगे।',
  'Adding to order {code}': 'ऑर्डर {code} में जोड़ रहे हैं',
  Cancel: 'रद्द करें',
  'Cancel adding to order {code}': 'ऑर्डर {code} में जोड़ना रद्द करें',
  'Nothing matches “{q}”': '“{q}” से कुछ नहीं मिला',
  'No vegetarian dishes right now': 'अभी कोई शाकाहारी व्यंजन नहीं है',
  'The menu is empty': 'मेन्यू खाली है',
  'Try a shorter word, or browse the categories.': 'छोटा शब्द आज़माएँ, या श्रेणियाँ देखें।',
  'Turn off the veg filter to see everything.': 'सब कुछ देखने के लिए शाकाहारी फ़िल्टर बंद करें।',
  'Ask the staff — they may be updating it.': 'स्टाफ़ से पूछें — शायद वे इसे अपडेट कर रहे हैं।',
  'Show everything': 'सब दिखाएँ',
  '{name} added': '{name} जोड़ा गया',
  'Not taking orders right now. Ask the staff when ordering reopens.': 'अभी ऑर्डर नहीं लिए जा रहे। स्टाफ़ से पूछें कि ऑर्डर कब शुरू होंगे।',
  'Okay. Anything you pick now goes in a new order': 'ठीक है। अब आप जो चुनेंगे वह नए ऑर्डर में जाएगा',
  'Menu categories': 'मेन्यू की श्रेणियाँ',
  '{n} dish': '{n} व्यंजन',
  '{n} dishes': '{n} व्यंजन',

  // Dish card + item sheet
  Add: 'जोड़ें',
  'Add {name}': '{name} जोड़ें',
  'Add {name}, choose options': '{name} जोड़ें, विकल्प चुनें',
  '{name}, {price}. Show details': '{name}, {price}. विवरण देखें',
  'Sold out': 'खत्म हो गया',
  customisable: 'अपनी पसंद से',
  'This dish is sold out right now.': 'यह व्यंजन अभी खत्म हो गया है।',
  'Not taking orders': 'ऑर्डर बंद हैं',
  Required: 'ज़रूरी',
  Optional: 'वैकल्पिक',
  ' · pick any': ' · कोई भी चुनें',
  ' · pick one': ' · एक चुनें',
  'Choose one to continue.': 'आगे बढ़ने के लिए एक चुनें।',
  'Special note': 'खास नोट',
  'Less spicy, no onions, extra chutney…': 'कम तीखा, बिना प्याज़, ज़्यादा चटनी…',
  '{n} characters left': '{n} अक्षर बाकी',

  // Cart bar
  'View order': 'ऑर्डर देखें',
  'Add to order': 'ऑर्डर में जोड़ें',
  '{n} item': '{n} आइटम',
  '{n} items': '{n} आइटम',

  // Cart sheet
  'Your order': 'आपका ऑर्डर',
  'Add to order {code}': 'ऑर्डर {code} में जोड़ें',
  '{items} to add': '{items} जोड़ने हैं',
  '{items} for {restaurant}': '{restaurant} के लिए {items}',
  'Nothing here yet': 'अभी यहाँ कुछ नहीं है',
  "You're offline. Reconnect to add these dishes.": 'आप ऑफ़लाइन हैं। ये व्यंजन जोड़ने के लिए फिर से कनेक्ट करें।',
  "You're offline. Reconnect to place your order.": 'आप ऑफ़लाइन हैं। ऑर्डर करने के लिए फिर से कनेक्ट करें।',
  'The restaurant is not taking orders right now.': 'रेस्टोरेंट अभी ऑर्डर नहीं ले रहा है।',
  'Place order': 'ऑर्डर करें',
  'Place as a new order instead': 'इसके बजाय नया ऑर्डर करें',
  'These dishes join order {code} and go to the kitchen as an addition. You pay for them with the rest of that order.':
    'ये व्यंजन ऑर्डर {code} में जुड़कर किचन जाएँगे। इनका भुगतान उसी ऑर्डर के साथ होगा।',
  'Nothing to add yet': 'अभी जोड़ने को कुछ नहीं',
  'Your order is empty': 'आपका ऑर्डर खाली है',
  'Pick the dishes you want to add from the menu.': 'मेन्यू से वे व्यंजन चुनें जो आप जोड़ना चाहते हैं।',
  'Add a few dishes from the menu and they will show up here.': 'मेन्यू से कुछ व्यंजन जोड़ें, वे यहाँ दिखेंगे।',
  'Back to menu': 'मेन्यू पर वापस',
  'Add a note for the kitchen': 'किचन के लिए नोट',
  'Allergies, timing, anything the kitchen should know': 'एलर्जी, समय, या किचन को कुछ और बताना हो',
  'Your name (optional)': 'आपका नाम (वैकल्पिक)',
  'So the waiter knows who ordered': 'ताकि वेटर को पता रहे कि ऑर्डर किसका है',
  'Mobile number (optional)': 'मोबाइल नंबर (वैकल्पिक)',
  'So {restaurant} recognises you next time. Optional.': 'ताकि {restaurant} अगली बार आपको पहचान सके। वैकल्पिक।',
  'Enter a 10-digit mobile number, like 98450 12345, or leave it empty.': '10 अंकों का मोबाइल नंबर डालें, जैसे 98450 12345, या खाली छोड़ दें।',
  'Check the mobile number, or leave it empty.': 'मोबाइल नंबर जाँचें, या खाली छोड़ दें।',
  // {nth} is the English ordinal ("5th"); {n} the bare number for the Hindi "5वीं".
  'Leave your number to collect visits: every {nth} visit gets {reward}.': 'विज़िट जमा करने के लिए अपना नंबर दें: हर {n}वीं विज़िट पर {reward}।',
  'How we use your number': 'हम आपके नंबर का उपयोग कैसे करते हैं',
  '(opens in a new tab)': '(नए टैब में खुलेगा)',
  'How would you like to pay?': 'भुगतान कैसे करेंगे?',
  'Payment method': 'भुगतान का तरीका',
  UPI: 'UPI',
  'Pay at counter': 'काउंटर पर भुगतान',
  'GPay, PhonePe, Paytm': 'GPay, PhonePe, Paytm',
  'Cash or card when you leave': 'जाते समय नकद या कार्ड',
  'Ask the staff how to pay — payment options are not set up yet.': 'भुगतान के बारे में स्टाफ़ से पूछें — भुगतान के विकल्प अभी तय नहीं हैं।',
  'New dishes only': 'केवल नए व्यंजन',
  Subtotal: 'उप-योग',
  'Service charge ({rate}%)': 'सर्विस चार्ज ({rate}%)',
  Total: 'कुल राशि',
  'For these dishes': 'इन व्यंजनों के लिए',
  'The total of order {code} updates to include these dishes once they are added.': 'ये व्यंजन जुड़ते ही ऑर्डर {code} की कुल राशि अपडेट हो जाएगी।',
  'Clear order': 'ऑर्डर हटाएँ',
  'Clear these dishes': 'ये व्यंजन हटाएँ',
  'Order cleared': 'ऑर्डर हटा दिया गया',
  'Edit note': 'नोट बदलें',
  'Add note': 'नोट जोड़ें',
  Done: 'हो गया',
  'e.g. less spicy': 'जैसे, कम तीखा',
  'Note for {name}': '{name} के लिए नोट',
  'Give it a second and try again.': 'एक पल रुककर फिर कोशिश करें।',
  'These dishes will go in as a new order': 'ये व्यंजन नए ऑर्डर के रूप में जाएँगे',
  'Added to order {code}': 'ऑर्डर {code} में जोड़ा गया',

  // Offers + live price (migration 0006)
  'Updating price…': 'कीमत अपडेट हो रही है…',
  'Showing the price without offers. The final total is worked out when you order.': 'ऑफ़र के बिना कीमत दिख रही है। अंतिम राशि ऑर्डर करते समय तय होगी।',
  'Happy hour ({names})': 'हैप्पी आवर ({names})',
  'Happy hour': 'हैप्पी आवर',
  'Coupon {code}': 'कूपन {code}',
  'Coupon {code} applied': 'कूपन {code} लग गया',
  'You save {amount}': 'आपकी बचत {amount}',
  'Remove coupon {code}': 'कूपन {code} हटाएँ',
  Remove: 'हटाएँ',
  'Have a coupon?': 'कूपन है?',
  'Coupon code': 'कूपन कोड',
  Apply: 'लगाएँ',
  'Remove coupon': 'कूपन हटाएँ',

  // Happy hour banner + serving windows
  'the whole menu': 'पूरे मेन्यू पर',
  'selected dishes': 'चुने हुए व्यंजनों पर',
  ' and ': ' और ',
  '{first} and {n} more': '{first} और {n} अन्य',
  '{percent}% off {scope}': '{scope} {percent}% की छूट',
  'until {time}': '{time} तक',
  '+{n} more offer': '+{n} और ऑफ़र',
  '+{n} more offers': '+{n} और ऑफ़र',
  'applied at checkout': 'ऑर्डर करते समय लगेगी',
  '{percent}% off right now, applied at checkout': 'अभी {percent}% की छूट, ऑर्डर करते समय लगेगी',
  Later: 'बाद में',
  '{name} is only served {window}': '{name} केवल {window} मिलता है',
  'Available {window}': '{window} उपलब्ध',
  'Serving now · {window}': 'अभी उपलब्ध · {window}',
};

export type TParams = Record<string, string | number>;

function fill(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, k: string) => (params[k] !== undefined ? String(params[k]) : whole));
}

/** Pure translate, usable outside React. */
export function translate(lang: Lang, key: string, params?: TParams): string {
  return fill(lang === 'hi' ? (HI[key] ?? key) : key, params);
}

/** Like `translate`, but placeholders can be React nodes (e.g. a styled order code). */
export function translateRich(lang: Lang, key: string, params: Record<string, React.ReactNode>): React.ReactNode[] {
  const template = lang === 'hi' ? (HI[key] ?? key) : key;
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    if (m && m[1]! in params) return React.createElement(React.Fragment, { key: i }, params[m[1]!]);
    return part;
  });
}

/** True when the restaurant wrote at least one Hindi dish or category name. */
export function hasHindiMenu(data: { items: Pick<MenuItem, 'name_hi'>[]; categories: Pick<MenuCategory, 'name_hi'>[] } | null | undefined): boolean {
  if (!data) return false;
  const has = (s: string | null | undefined) => Boolean(s && s.trim());
  return data.items.some((i) => has(i.name_hi)) || data.categories.some((c) => has(c.name_hi));
}

export interface Localized {
  text: string;
  /** "hi" when the Hindi text is shown (put it on the element's `lang`), undefined otherwise. */
  lang: 'hi' | undefined;
}

/** Hindi text when in Hindi mode and the restaurant wrote one, otherwise the English field. */
export function pick(lang: Lang, en: string, hi: string | null | undefined): Localized {
  if (lang === 'hi' && hi && hi.trim()) return { text: hi.trim(), lang: 'hi' };
  return { text: en, lang: undefined };
}

/** Same as `pick`, for optional fields (descriptions). */
export function pickOptional(lang: Lang, en: string | null | undefined, hi: string | null | undefined): Localized | null {
  if (lang === 'hi' && hi && hi.trim()) return { text: hi.trim(), lang: 'hi' };
  return en && en.trim() ? { text: en, lang: undefined } : null;
}

type Named = { name: string; name_hi?: string | null };
type Described = { description: string | null; description_hi?: string | null };

export const dishName = (lang: Lang, item: Named) => pick(lang, item.name, item.name_hi);
export const dishDescription = (lang: Lang, item: Described) => pickOptional(lang, item.description, item.description_hi);

/** Lower-cased haystack for search: English and Hindi names and descriptions. */
export function searchText(item: Named & Described): string {
  return [item.name, item.name_hi, item.description, item.description_hi].filter(Boolean).join(' \n ').toLowerCase();
}

// ---------------------------------------------------------------------------
// React context
// ---------------------------------------------------------------------------

export interface LangContextValue {
  /** Effective language: Hindi only when chosen AND the menu has Hindi content. */
  lang: Lang;
  /** Whether to show the switch at all. */
  available: boolean;
  setLang: (lang: Lang) => void;
  t: (key: string, params?: TParams) => string;
  tRich: (key: string, params: Record<string, React.ReactNode>) => React.ReactNode[];
  /** `lang` attribute for translated UI strings: "hi" in Hindi mode, undefined in English. */
  uiLang: 'hi' | undefined;
}

const LangContext = React.createContext<LangContextValue | null>(null);

function readStoredLang(): Lang {
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY) === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

/** Provided once by GuestShell (inside TableProvider) so every guest page shares the choice. */
export function LangProvider({ children }: { children: React.ReactNode }) {
  const { data } = useTable();
  const [chosen, setChosen] = React.useState<Lang>('en');

  React.useEffect(() => {
    setChosen(readStoredLang());
    // Another tab at the same table switched language.
    const onStorage = (e: StorageEvent) => {
      if (e.key === LANG_STORAGE_KEY) setChosen(e.newValue === 'hi' ? 'hi' : 'en');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const available = hasHindiMenu(data);
  const lang: Lang = available && chosen === 'hi' ? 'hi' : 'en';

  const setLang = React.useCallback((next: Lang) => {
    setChosen(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
  }, []);

  const value = React.useMemo<LangContextValue>(
    () => ({
      lang,
      available,
      setLang,
      t: (key, params) => translate(lang, key, params),
      tRich: (key, params) => translateRich(lang, key, params),
      uiLang: lang === 'hi' ? 'hi' : undefined,
    }),
    [lang, available, setLang],
  );

  return React.createElement(LangContext.Provider, { value }, children);
}

const FALLBACK: LangContextValue = {
  lang: 'en',
  available: false,
  setLang: () => {},
  t: (key, params) => translate('en', key, params),
  tRich: (key, params) => translateRich('en', key, params),
  uiLang: undefined,
};

/** Current guest language. Outside a LangProvider it is always English. */
export function useLang(): LangContextValue {
  return React.useContext(LangContext) ?? FALLBACK;
}
