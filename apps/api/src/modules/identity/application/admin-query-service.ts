import type { LeadsDto, UsersDto } from '@mente-ativa/shared';
import { PatientModel, LeadModel, UserModel } from '../../shared/infra/models.js';

export class AdminQueryService {
  async users(): Promise<UsersDto> {
    const [users, counts] = await Promise.all([
      UserModel.find({}, { username: 1, name: 1, role: 1 }).sort({ _id: 1 }).lean(),
      PatientModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$responsibleUsername', count: { $sum: 1 } } },
      ]),
    ]);
    const patientsByUser = new Map(counts.map((entry) => [entry._id, entry.count]));
    return {
      items: users.map((user) => ({
        username: user.username,
        name: user.name,
        role: user.role,
        patientCount: patientsByUser.get(user.username) ?? 0,
      })),
    };
  }

  async leads(): Promise<LeadsDto> {
    const leads = await LeadModel.find().sort({ createdAt: -1, _id: -1 }).lean();
    return {
      items: leads.map((lead) => ({
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        profile: lead.profile,
        workplace: lead.workplace,
        username: lead.username,
        createdAt: lead.createdAt.toISOString(),
      })),
    };
  }
}
