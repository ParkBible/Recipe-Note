import { ButtonLink, EmptyState } from '@/components/ui';

export function NotFoundPage() {
  return (
    <EmptyState
      icon="search"
      title="페이지를 찾을 수 없어요"
      description="주소가 잘못되었거나 사라진 페이지예요."
      action={<ButtonLink to="/">홈으로</ButtonLink>}
    />
  );
}
