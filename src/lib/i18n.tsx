import { useEffect, useState } from 'react'

// English / Hindi for the screens people outside the office read: the monitor's phone and the printed sheets.
export type Lang = 'en' | 'hi'
const KEY = 'drillmap:lang'

export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>(() => {
    try { return localStorage.getItem(KEY) === 'hi' ? 'hi' : 'en' } catch { return 'en' }
  })
  useEffect(() => {
    try { localStorage.setItem(KEY, lang) } catch { /* blocked */ }
    document.documentElement.lang = lang
  }, [lang])
  return [lang, setLang]
}

const ORD = ['st', 'nd', 'rd']

export const T = {
  en: {
    drill: 'drill',
    pickClass: 'Which class are you the monitor for?',
    notFound: 'Drill not found',
    checkCode: 'Check the code with your teacher:',
    connecting: 'Connecting…',
    changeClass: 'change class',
    connected: 'connected',
    offline: 'offline',
    waiting: (n: number) => `${n} tap(s) waiting to send`,
    ended: 'The drill has ended.',
    notReached: 'Your class was not marked as reaching the assembly point.',
    youreIn: "You're in. Wait for the alarm.",
    keepOpen: 'Keep this screen open. When the alarm rings, the clock starts here by itself.',
    yourRoute: 'Your route:',
    sinceAlarm: 'since the alarm',
    route: 'Route:',
    left: 'Our class has left the room',
    leftAt: 'Left at',
    go: 'Go:',
    assemblyDefault: 'the assembly point',
    reached: (place: string) => `We reached ${place}`,
    reachedIn: 'Reached in',
    countNow: 'Now count your class.',
    ofList: (n: number) => `of ${n} on the list`,
    sendCount: 'Send headcount',
    done: 'Done',
    outIn: 'Out in',
    counted: (p: number, n: number) => `${p} of ${n} counted`,
    tellTeacher: (k: number) => `Tell your teacher now: ${k} not counted.`,
    undo: 'Undo last tap',
    // print
    evacPlan: 'Evacuation plan',
    assemblyPoint: 'Assembly point',
    whenAlarm: 'When the alarm rings:',
    rules: 'leave bags, teacher at the door, walk in a line, no running, do not use the lift, follow the green arrows.',
    stairOrder: (k: string) => `Staircase ${k} order`,
    prepared: (d: string) => `Prepared ${d} with Drillmap.`,
    cardsHead: 'Route cards · cut and stick inside each classroom door',
    yourTurn: (k: string, pos: number) => <>Staircase {k}: you are <b>{pos}{ORD[pos - 1] || 'th'}</b></>,
    after: (list: string) => `, after ${list}`,
    planned: (t: string, n: number, a: string) => <>Planned: all out by <span className="mono">{t}</span> · {n} people · Assembly: {a}</>,
    staircase: 'Staircase',
    people: 'people',
    locale: 'en-IN',
  },
  hi: {
    drill: 'ड्रिल',
    pickClass: 'आप किस कक्षा के मॉनिटर हैं?',
    notFound: 'ड्रिल नहीं मिली',
    checkCode: 'अपने शिक्षक से कोड जाँच लें:',
    connecting: 'जुड़ रहा है…',
    changeClass: 'कक्षा बदलें',
    connected: 'जुड़ा है',
    offline: 'नेटवर्क नहीं है',
    waiting: (n: number) => `${n} टैप भेजना बाकी`,
    ended: 'ड्रिल ख़त्म हो गई है।',
    notReached: 'आपकी कक्षा के एकत्र होने की जगह पर पहुँचने की सूचना नहीं मिली।',
    youreIn: 'आप जुड़ गए हैं। अलार्म का इंतज़ार करें।',
    keepOpen: 'यह स्क्रीन खुली रखें। अलार्म बजने पर घड़ी अपने आप चलने लगेगी।',
    yourRoute: 'आपका रास्ता:',
    sinceAlarm: 'अलार्म बजने के बाद से',
    route: 'रास्ता:',
    left: 'हमारी कक्षा कमरे से निकल गई',
    leftAt: 'निकलने का समय',
    go: 'जाएँ:',
    assemblyDefault: 'एकत्र होने की जगह',
    reached: (place: string) => `हम ${place} पहुँच गए`,
    reachedIn: 'पहुँचने में लगा समय',
    countNow: 'अब अपनी कक्षा के बच्चे गिनें।',
    ofList: (n: number) => `सूची के ${n} बच्चों में से`,
    sendCount: 'गिनती भेजें',
    done: 'हो गया',
    outIn: 'बाहर आने में लगा समय',
    counted: (p: number, n: number) => `${n} में से ${p} गिने गए`,
    tellTeacher: (k: number) => `अभी अपने शिक्षक को बताएँ: ${k} बच्चे गिनती में नहीं हैं।`,
    undo: 'पिछला टैप रद्द करें',
    evacPlan: 'निकासी योजना',
    assemblyPoint: 'एकत्र होने की जगह',
    whenAlarm: 'अलार्म बजने पर:',
    rules: 'बस्ते छोड़ दें, शिक्षक दरवाज़े पर रहें, एक लाइन में चलें, दौड़ें नहीं, लिफ़्ट का इस्तेमाल न करें, हरे तीरों की दिशा में चलें।',
    stairOrder: (k: string) => `सीढ़ी ${k} पर उतरने का क्रम`,
    prepared: (d: string) => `${d} को Drillmap से तैयार किया गया।`,
    cardsHead: 'रास्ता कार्ड · काटकर हर कक्षा के दरवाज़े के अंदर चिपकाएँ',
    yourTurn: (k: string, pos: number) => <>सीढ़ी {k}: आपका नंबर <b>{pos}</b> है</>,
    after: (list: string) => `, ${list} के बाद`,
    planned: (t: string, n: number, a: string) => <>योजना: सब <span className="mono">{t}</span> तक बाहर · {n} लोग · एकत्र होने की जगह: {a}</>,
    staircase: 'सीढ़ी',
    people: 'लोग',
    locale: 'hi-IN',
  },
}

// "Staircase A → Main gate → Playground": only the word Staircase is ours, the rest are the school's own names
export function routeText(summary: string, lang: Lang) {
  return lang === 'hi' ? summary.replace(/Staircase /g, 'सीढ़ी ') : summary
}

export function LangToggle({ lang, set }: { lang: Lang; set: (l: Lang) => void }) {
  return (
    <div className="langtoggle" role="group" aria-label="Language">
      <button className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => set('en')}>English</button>
      <button className={lang === 'hi' ? 'on' : ''} aria-pressed={lang === 'hi'} onClick={() => set('hi')} lang="hi">हिंदी</button>
    </div>
  )
}
