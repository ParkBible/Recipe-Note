import { useSearchParams } from 'react-router-dom';

export type PreviewState = 'loading' | 'error' | 'empty';

/**
 * 디자인 확인용: URL 에 ?state=loading|error|empty 를 붙이면 해당 상태 UI 를 강제로 보여준다.
 * 실제 데이터 연결 후에도 QA 용으로 남겨둘 수 있다. 필요 없으면 각 페이지에서 호출만 지우면 된다.
 */
export function usePreviewState(): PreviewState | null {
  const [params] = useSearchParams();
  const value = params.get('state');
  return value === 'loading' || value === 'error' || value === 'empty' ? value : null;
}
