import { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Panel, PanelBody, PanelHeader } from '../ui/Panel';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { PROFILE_FIELDS, RECORD_CATEGORIES } from '../../constants/personnel';
import { formatDate } from '../../utils/leaveCalculations';

const PROFILE_TABS = [
  { key: 'basic', label: '기본정보' },
  { key: 'military', label: '병역' },
];

function fieldOrder(category) {
  return [...Object.keys(category.fields), 'notes'];
}

function fieldLabel(category, key) {
  return key === 'notes' ? '비고' : category.fields[key];
}

function EmployeeSummary({ employee }) {
  const items = [
    ['사번', employee.empNo || '-'],
    ['사업장', employee.workplace || '-'],
    ['부서', employee.department || '-'],
    ['직급', employee.position || '-'],
    ['겸직', [employee.concurrentDept, employee.concurrentPosition].filter(Boolean).join(' · ') || '-'],
    ['직종', employee.jobType || '-'],
    ['입사일', formatDate(employee.hireDate)],
    ['퇴사일', employee.terminatedDate ? formatDate(employee.terminatedDate) : '-'],
    ['회사 이메일', employee.email || '-'],
  ];
  return (
    <Panel className="mb-5">
      <PanelBody>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold text-stripe-text">{employee.name}</h2>
          {employee.isActive ? <Badge variant="success">재직</Badge> : <Badge variant="default">퇴사</Badge>}
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-3">
          {items.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] text-stripe-muted">{label}</dt>
              <dd className="text-sm text-stripe-text truncate">{value}</dd>
            </div>
          ))}
        </dl>
      </PanelBody>
    </Panel>
  );
}

function ProfileSection({ section, profile, editable, onSave, isSaving }) {
  const fields = PROFILE_FIELDS.filter((f) => f.section === section);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');

  function startEditing() {
    setForm(Object.fromEntries(fields.map((f) => [f.key, profile[f.key] || ''])));
    setError('');
    setEditing(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await onSave(form);
      setEditing(false);
    } catch (err) {
      setError(err.message || '저장하지 못했습니다.');
    }
  }

  const title = PROFILE_TABS.find((t) => t.key === section)?.label;

  return (
    <Panel>
      <PanelHeader
        title={title}
        description={profile.updatedAt ? `최종 수정 ${profile.updatedAt}` : undefined}
        actions={
          editable &&
          !editing && (
            <Button variant="secondary" onClick={startEditing}>
              <Pencil className="h-4 w-4" />
              수정
            </Button>
          )
        }
      />
      <PanelBody>
        {editing ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fields.map((field) => (
                <div key={field.key} className={field.wide ? 'sm:col-span-2' : ''}>
                  <label className="stripe-label">{field.label}</label>
                  {field.options ? (
                    <select
                      className="stripe-input"
                      value={form[field.key] || ''}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    >
                      <option value="">선택 안 함</option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type === 'date' ? 'date' : 'text'}
                      className="stripe-input"
                      value={form[field.key] || ''}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
            {error && <p className="text-sm text-[#df1b41]">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                취소
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? '저장 중…' : '저장'}
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {fields.map((field) => (
              <div key={field.key} className={field.wide ? 'sm:col-span-2' : ''}>
                <dt className="text-[11px] text-stripe-muted">{field.label}</dt>
                <dd className="text-sm text-stripe-text whitespace-pre-wrap break-words">
                  {profile[field.key] || <span className="text-stripe-muted">-</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </PanelBody>
    </Panel>
  );
}

function RecordFormModal({ category, record, onClose, onSubmit, isSaving }) {
  const keys = fieldOrder(category);
  const [form, setForm] = useState(() => Object.fromEntries(keys.map((k) => [k, record?.[k] || ''])));
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await onSubmit({ category: category.key, ...form });
    } catch (err) {
      setError(err.message || '저장하지 못했습니다.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="flex items-center justify-between border-b border-stripe-border px-5 py-4">
          <h2 className="text-base font-semibold text-stripe-text">
            {category.label} {record ? '수정' : '추가'}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {keys.map((key) => {
            const isDate = key === 'startDate' || key === 'endDate';
            const isLong = key === 'detail' || key === 'notes';
            const listId = category.suggestions?.[key] ? `personnel-${category.key}-${key}` : undefined;
            return (
              <div key={key}>
                <label className="stripe-label">{fieldLabel(category, key)}</label>
                {isLong ? (
                  <textarea
                    rows={2}
                    className="stripe-input resize-none"
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                ) : (
                  <input
                    type="text"
                    className={`stripe-input ${isDate ? 'font-mono' : ''}`}
                    placeholder={isDate ? 'YYYY-MM-DD 또는 YYYY-MM' : undefined}
                    list={listId}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                )}
                {listId && (
                  <datalist id={listId}>
                    {category.suggestions[key].map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                )}
              </div>
            );
          })}
          {error && <p className="text-sm text-[#df1b41]">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? '저장 중…' : '저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RecordSection({ category, records, editable, onSave, onDelete, isSaving }) {
  const [modal, setModal] = useState(null);
  const keys = fieldOrder(category);

  async function handleSubmit(data) {
    await onSave(modal.record?.id, data);
    setModal(null);
  }

  async function handleDelete(record) {
    const name = record.title || record.organization || category.label;
    if (!window.confirm(`${category.label} "${name}" 항목을 삭제할까요?`)) return;
    try {
      await onDelete(record.id);
    } catch (err) {
      window.alert(err.message || '삭제하지 못했습니다.');
    }
  }

  return (
    <Panel>
      <PanelHeader
        title={category.label}
        description={`${records.length}건`}
        actions={
          editable && (
            <Button variant="secondary" onClick={() => setModal({ record: null })}>
              <Plus className="h-4 w-4" />
              추가
            </Button>
          )
        }
      />
      {records.length === 0 ? (
        <p className="py-10 text-center text-sm text-stripe-muted">등록된 {category.label} 내역이 없습니다.</p>
      ) : (
        <div className="stripe-table-fit-wrap">
          <table className="stripe-table stripe-table-fit w-full">
            <thead>
              <tr>
                {keys.map((key) => (
                  <th key={key}>{fieldLabel(category, key)}</th>
                ))}
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  {keys.map((key) => (
                    <td
                      key={key}
                      className={`${key.endsWith('Date') ? 'font-mono text-[13px] whitespace-nowrap' : ''} ${
                        key === 'detail' || key === 'notes' ? 'whitespace-pre-wrap break-words max-w-[240px]' : ''
                      }`}
                    >
                      {record[key] || <span className="muted">-</span>}
                    </td>
                  ))}
                  {editable && (
                    <td className="text-right whitespace-nowrap">
                      <button
                        className="p-1 text-stripe-muted hover:text-primary-500"
                        title="수정"
                        onClick={() => setModal({ record })}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="p-1 text-stripe-muted hover:text-[#df1b41]"
                        title="삭제"
                        onClick={() => handleDelete(record)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <RecordFormModal
          category={category}
          record={modal.record}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
          isSaving={isSaving}
        />
      )}
    </Panel>
  );
}

/**
 * 인사기록카드 화면. editable 이면 수정 버튼을 보여 줍니다.
 * handlers: { saveProfile(data), saveRecord(recordId, data), deleteRecord(recordId), isSaving }
 * documents 를 넘기면(관리자 화면) 증명서류 탭을 붙입니다.
 */
export function PersonnelCard({ card, editable = false, handlers = {}, documents = null }) {
  const categories = RECORD_CATEGORIES.filter((c) => card.records[c.key]);
  const tabs = [
    ...PROFILE_TABS,
    ...categories.map((c) => ({ key: c.key, label: c.label })),
    ...(documents ? [{ key: 'documents', label: '증명서류' }] : []),
  ];
  const [tab, setTab] = useState('basic');
  const category = categories.find((c) => c.key === tab);

  return (
    <div>
      <EmployeeSummary employee={card.employee} />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-stripe-border">
        {tabs.map((item) => {
          const count = card.records[item.key]?.length;
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                tab === item.key
                  ? 'border-primary-500 text-primary-600 font-medium'
                  : 'border-transparent text-stripe-muted hover:text-stripe-text'
              }`}
            >
              {item.label}
              {count ? <span className="ml-1 text-[11px] text-stripe-muted">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {tab === 'documents' ? (
        documents
      ) : category ? (
        <RecordSection
          key={category.key}
          category={category}
          records={card.records[category.key]}
          editable={editable}
          onSave={handlers.saveRecord}
          onDelete={handlers.deleteRecord}
          isSaving={handlers.isSaving}
        />
      ) : (
        <ProfileSection
          key={tab}
          section={tab}
          profile={card.profile}
          editable={editable}
          onSave={handlers.saveProfile}
          isSaving={handlers.isSaving}
        />
      )}
    </div>
  );
}
