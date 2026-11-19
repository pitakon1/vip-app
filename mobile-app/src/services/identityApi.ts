/** 实名认证 API（证件上传 + 人工审核）。 */
import api from '@/lib/api';

export interface IdentityStatus {
  status: 'none' | 'pending' | 'approved' | 'rejected';
  id?: string | null;
  doc_type?: string | null;
  real_name?: string | null;
  id_number_masked?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  consent_policy_version?: string | null;
  is_verified?: boolean;
}

type Envelope<T> = { data?: T } & T;

const unwrap = <T,>(res: { data: Envelope<T> | T }): T => {
  const body = res.data as Envelope<T>;
  return (body && typeof body === 'object' && body.data !== undefined ? body.data : body) as T;
};

export const identityApi = {
  me: async (): Promise<IdentityStatus> => unwrap(await api.get('/identity/me')),
  submit: async (form: FormData): Promise<IdentityStatus> =>
    unwrap(
      await api.post('/identity/submit', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    ),
};
