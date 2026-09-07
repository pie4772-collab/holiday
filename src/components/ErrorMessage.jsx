import { AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Panel, PanelBody } from './ui/Panel';

export function ErrorMessage({ message, onRetry }) {
  return (
    <Panel>
      <PanelBody>
        <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fee2e2]">
            <AlertCircle className="h-5 w-5 text-[#df1b41]" />
          </div>
          <p className="text-sm text-stripe-muted max-w-sm">
            {message || '데이터를 불러오는 중 오류가 발생했습니다.'}
          </p>
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              다시 시도
            </Button>
          )}
        </div>
      </PanelBody>
    </Panel>
  );
}
