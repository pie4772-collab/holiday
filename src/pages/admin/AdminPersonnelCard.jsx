import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileSearch } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { PersonnelCard } from '../../components/personnel/PersonnelCard';
import { PersonnelDocuments } from '../../components/personnel/PersonnelDocuments';
import { DocumentViewer } from '../../components/personnel/DocumentViewer';
import { useCurrentEmployee } from '../../hooks/useLeaveData';
import {
  useDeletePersonnelRecord,
  usePersonnelCard,
  useSavePersonnelProfile,
  useSavePersonnelRecord,
} from '../../hooks/usePersonnel';
import { hasPermission } from '../../utils/access';

const VIEWER_KEY = 'holiday_personnel_viewer';

export function AdminPersonnelCard() {
  const { id } = useParams();
  const { data: card, isLoading, isError, error, refetch } = usePersonnelCard(id);
  const { data: currentEmployee } = useCurrentEmployee();
  const saveProfile = useSavePersonnelProfile();
  const saveRecord = useSavePersonnelRecord();
  const deleteRecord = useDeletePersonnelRecord();
  const [viewer, setViewer] = useState(() => localStorage.getItem(VIEWER_KEY) === '1');
  const [viewerDocId, setViewerDocId] = useState(null);
  const editable = hasPermission(currentEmployee, 'records.edit');

  function toggleViewer(open) {
    setViewer(open);
    localStorage.setItem(VIEWER_KEY, open ? '1' : '0');
  }

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
      <PageHeader
        title="인사기록카드"
        backTo="/admin/personnel"
        backLabel="인사기록카드 목록"
        actions={
          <Button variant={viewer ? 'primary' : 'secondary'} onClick={() => toggleViewer(!viewer)}>
            <FileSearch className="h-4 w-4" />
            {viewer ? '서류 보기 닫기' : '서류 보며 입력'}
          </Button>
        }
      />
      <div className={viewer ? 'grid grid-cols-1 xl:grid-cols-2 gap-5 items-start' : ''}>
        {viewer && (
          <DocumentViewer
            employeeId={id}
            docId={viewerDocId}
            onSelect={setViewerDocId}
            onClose={() => toggleViewer(false)}
            className="h-[65vh] xl:h-[calc(100vh-4rem)] xl:sticky xl:top-8"
          />
        )}
        <div className="min-w-0">
          <PersonnelCard
            card={card}
            editable={editable}
            inlineForms={viewer}
            handlers={{
              saveProfile: (data) => saveProfile.mutateAsync({ employeeId: id, data }),
              saveRecord: (recordId, data) => saveRecord.mutateAsync({ employeeId: id, recordId, data }),
              deleteRecord: (recordId) => deleteRecord.mutateAsync({ recordId }),
              isSaving: saveProfile.isPending || saveRecord.isPending || deleteRecord.isPending,
            }}
            documents={
              <PersonnelDocuments
                employeeId={id}
                editable={editable}
                onPreview={(doc) => {
                  setViewerDocId(doc.id);
                  toggleViewer(true);
                }}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
