import { useEffect, useState } from 'react';

function readStored(key: string, fallback: string[]): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value;
  } catch {
    /* 저장소 접근 불가·깨진 값이면 기본값 */
  }
  return fallback;
}

/** 이 브라우저에만 기억하는 문자열 목록 (냉장고 재료 등) */
export function useStoredList(key: string, fallback: string[]) {
  const [list, setList] = useState<string[]>(() => readStored(key, fallback));

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      /* noop */
    }
  }, [key, list]);

  return [list, setList] as const;
}
