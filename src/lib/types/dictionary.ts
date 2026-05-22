export interface DictEntry {
  traditional: string;
  simplified: string;
  pinyin: string;
  definitions: string[];
  isClassical?: boolean;
  examples?: ExampleSentence[];
}

export interface ExampleSentence {
  chinese: string;
  pinyin: string;
  translation: string;
}

export interface LookupResult {
  query: string;
  entries: DictEntry[];
  source: 'cedict' | 'classical' | 'unknown';
  segmentationContext: string[];
  segmentIndex: number;
}
