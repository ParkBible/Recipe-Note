/**
 * 재료명 정규화. 추천 매칭과 검색이 같은 키를 쓰도록 한곳에 둔다.
 * 화면에 보이는 이름은 저장된 원문 그대로 두고, 비교할 때만 canonicalIngredient() 를 거친다.
 */

/** 같은 재료로 취급할 이름 묶음. 첫 번째가 대표 이름이다 */
const SYNONYM_GROUPS: string[][] = [
  ['계란', '달걀', '에그'],
  ['대파', '파'],
  ['밥', '쌀밥', '흰밥', '공기밥', '즉석밥', '햇반'],
  ['김치', '배추김치', '신김치', '묵은지'],
  ['마늘', '다진마늘', '간마늘', '깐마늘', '통마늘'],
  ['간장', '진간장', '양조간장'],
  ['설탕', '백설탕', '흰설탕'],
  ['소금', '꽃소금', '천일염'],
  ['후추', '후춧가루', '통후추'],
  ['식용유', '포도씨유', '카놀라유', '해바라기유'],
  ['고춧가루', '고추가루', '고운고춧가루'],
  ['깨', '통깨', '참깨'],
  ['맛술', '미림'],
  ['물엿', '올리고당'],
  ['두부', '부침두부', '찌개두부'],
  ['우유', '흰우유'],
  ['파마산치즈', '파마산', '파르메산치즈'],
];

const SYNONYMS = new Map<string, string>();
for (const [head, ...rest] of SYNONYM_GROUPS) {
  for (const name of [head, ...rest]) SYNONYMS.set(name, head);
}

/** 공백·괄호 설명을 지우고 소문자로 맞춘 비교용 문자열 */
export function compactText(text: string): string {
  return text
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 비교용 대표 재료명. "달걀 " → "계란", "대 파" → "대파", "파" → "대파" */
export function canonicalIngredient(name: string): string {
  const compact = compactText(name);
  return SYNONYMS.get(compact) ?? compact;
}
