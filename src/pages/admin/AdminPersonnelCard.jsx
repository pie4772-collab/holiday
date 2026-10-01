import { useParams } from 'react-router-dom';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { PersonnelCard } from '../../components/personnel/PersonnelCard';
import { PersonnelDocuments } from '../../components/personnel/PersonnelDocuments';
import { useCurrentEmployee } from '../../hooks/useLeaveData';
import {
  useDeletePersonnelRecord,
  usePersonnelCard,
  useSavePersonnelProfile,
  useSavePersonnelRecord,
} from '../../hooks/usePersonnel';
import { hasPermission } from '../../utils/access';

export function AdminPersonnelCard() {
  const { id } = useParams();
  const { data: card, isLoading, isError, error, refetch } = usePersonnelCard(id);
  const { data: currentEmployee } = useCurrentEmployee();
  const saveProfile = useSavePersonnelProfile();
  const saveRecord = useSavePersonnelRecord();
  const deleteRecord = useDeletePersonnelRecord();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (isError) return <ErrorMessage message={error?.message} onRetry={() => refetch()} />;

  return (
    <div>
      <PageHeader title="인사기록카드" backTo="/admin/personnel" backLabel="인사기록카드 목록" />
      <PersonnelCard
        card={card}
        editable={hasPermission(currentEmployee, 'records.edit')}
        handlers={{
          saveProfile: (data) => saveProfile.mutateAsync({ employeeId: id, data }),
          saveRecord: (recordId, data) => saveRecord.mutateAsync({ employeeId: id, recordId, data }),
          deleteRecord: (recordId) => deleteRecord.mutateAsync({ recordId }),
          isSaving: saveProfile.isPending || saveRecord.isPending || deleteRecord.isPending,
        }}
        documents={<PersonnelDocuments employeeId={id} editable={hasPermission(currentEmployee, 'records.edit')} />}
      />
    </div>
  );
}
