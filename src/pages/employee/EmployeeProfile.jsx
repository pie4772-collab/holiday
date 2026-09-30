import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { PersonnelCard } from '../../components/personnel/PersonnelCard';
import { useMyPersonnelCard } from '../../hooks/usePersonnel';

export function EmployeeProfile() {
  const { data: card, isLoading, isError, refetch } = useMyPersonnelCard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (isError) return <ErrorMessage onRetry={() => refetch()} />;

  return (
    <div>
      <PageHeader
        title="내 인사기록"
        description="잘못된 내용이 있으면 인사담당자에게 알려 주세요."
      />
      <PersonnelCard card={card} />
    </div>
  );
}
