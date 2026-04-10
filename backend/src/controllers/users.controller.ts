import { AppDataSource } from '../config/data-source';
import { User } from '../models/user.model';

export async function listUsersDirectory(_req: any, res: any) {
  const userRepository = AppDataSource.getRepository(User);
  const users = await userRepository.find({
    select: ['id', 'fullName', 'role', 'isActive'],
    where: { isActive: true },
    order: { fullName: 'ASC' },
  });

  res.json(users.map((user) => ({
    id: user.id,
    fullName: user.fullName,
    role: user.role,
  })));
}
