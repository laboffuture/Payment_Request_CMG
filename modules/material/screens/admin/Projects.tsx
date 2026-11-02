'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProjectDto } from '@cm/shared';
import { del, get, post, put } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, Card, PageHeader } from '@mm/components/ui';
import { Modal } from '@mm/components/Modal';
import { useToast } from '@mm/components/Toast';
import { useAction } from '@mm/lib/hooks';

/**
 * Prototype: VIEWS.projects, A.addProject.
 * A local project is added only when it is not in the Payment app (§10). Every project can
 * be edited (a Payment app one then keeps its new code and name through the sync) or deleted
 * while nothing uses it.
 */
export default function ProjectsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<ProjectDto | null>(null);
  const [deleting, setDeleting] = useState<ProjectDto | null>(null);

  const projects = useQuery({
    queryKey: ['admin', 'projects'],
    queryFn: () => get<ProjectDto[]>('/admin/projects'),
  });

  const add = useMutation({
    mutationFn: () => post<ProjectDto>('/admin/projects', { code, name }),
    onSuccess: () => {
      toast('Project added');
      setCode('');
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      void queryClient.invalidateQueries({ queryKey: ['reference'] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not add'),
  });

  // The job register in Payment → Settings is the source; this pulls it now.
  const sync = useMutation({
    mutationFn: () => post<{ projects: number }>('/admin/projects/sync'),
    onSuccess: (r) => {
      toast(r.projects ? `${r.projects} project(s) brought in from the Payment app` : 'Already up to date');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      void queryClient.invalidateQueries({ queryKey: ['reference'] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not sync'),
  });

  const columns: Column<ProjectDto>[] = [
    { key: 'code', header: 'Code', render: (p) => <span className="font-mono">{p.code}</span> },
    { key: 'name', header: 'Name', render: (p) => p.name },
    { key: 'source', header: 'Source', render: (p) => p.sourceLabel },
    { key: 'mrs', header: 'MRs', align: 'right', render: (p) => p.mrCount ?? 0 },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <div className="flex gap-2">
          <Btn small onClick={() => setEditing(p)}>
            Edit
          </Btn>
          <Btn
            small
            variant="danger"
            disabled={!!p.mrCount}
            title={p.mrCount ? 'Has material requests - cannot be deleted' : undefined}
            onClick={() => setDeleting(p)}
          >
            Delete
          </Btn>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Projects come from the job register (JB code, project, site) in Payment → Settings, and refresh every 15 minutes. Add one here only if it is not a payment job."
        actions={
          <Btn disabled={sync.isPending} onClick={() => sync.mutate()}>
            {sync.isPending ? 'Syncing…' : 'Sync from Payment app'}
          </Btn>
        }
      />

      <Card className="mb-3">
        <div className="flex flex-wrap items-end gap-[10px]">
          <input
            aria-label="Project code"
            placeholder="Project code"
            className="w-[160px]"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <input
            aria-label="Project name"
            placeholder="Project name"
            className="flex-1 min-w-[180px]"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Btn variant="primary" disabled={add.isPending} onClick={() => add.mutate()}>
            Add project
          </Btn>
        </div>
      </Card>

      {projects.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={projects.data ?? []}
          rowKey={(p) => p.id}
          emptyText="No projects yet"
        />
      )}
      {editing ? <EditProject project={editing} onClose={() => setEditing(null)} /> : null}
      {deleting ? <DeleteProject project={deleting} onClose={() => setDeleting(null)} /> : null}
    </>
  );
}

const PROJECT_KEYS = [['admin', 'projects'], ['reference']];

/** Change a project's code or name. */
function EditProject({ project, onClose }: { project: ProjectDto; onClose: () => void }) {
  const [code, setCode] = useState(project.code);
  const [name, setName] = useState(project.name);
  const save = useAction(() => put<ProjectDto>(`/admin/projects/${project.id}`, { code, name }), {
    success: (p) => `${p.code} saved`,
    invalidate: PROJECT_KEYS,
    onDone: onClose,
  });
  const fromPayment = project.source === 'PAYMENT_APP';

  return (
    <Modal
      title={`Edit ${project.code}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            disabled={save.isPending || !code.trim() || !name.trim()}
            onClick={() => save.mutate(undefined)}
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Btn>
        </>
      }
    >
      <label className="field">
        Project code *
        <input value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} />
      </label>
      <label className="field">
        Project name *
        <input value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="text-mut text-sm mb-0">
        Material requests, POs and reports show the new code and name straight away.
        {fromPayment
          ? ' This project comes from the Payment app job register: once saved here, the sync keeps your code and name instead of the job register\'s.'
          : ''}
      </p>
    </Modal>
  );
}

/** Asks before a project is deleted; the API refuses one that anything still uses. */
function DeleteProject({ project, onClose }: { project: ProjectDto; onClose: () => void }) {
  const remove = useAction(() => del<{ ok: true }>(`/admin/projects/${project.id}`), {
    success: `${project.code} deleted`,
    invalidate: PROJECT_KEYS,
    onDone: onClose,
  });

  return (
    <Modal
      title={`Delete ${project.code}?`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Keep the project</Btn>
          <Btn variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(undefined)}>
            {remove.isPending ? 'Deleting…' : 'Delete project'}
          </Btn>
        </>
      }
    >
      <p>
        <b>{project.code}</b> - {project.name} is removed from Material Management for
        everybody and can no longer be picked on a material request.
      </p>
      <p className="text-mut text-sm mb-0">
        A project that has material requests, purchase orders, store issues, stock or enquiries
        against it, or a login kept to it in User roles, cannot be deleted - you are told what
        uses it.
        {project.source === 'PAYMENT_APP'
          ? ' This project comes from the Payment app: the sync will not bring it back.'
          : ''}
      </p>
    </Modal>
  );
}
