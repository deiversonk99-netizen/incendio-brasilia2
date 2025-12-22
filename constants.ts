
import { Project, Task, Transaction } from './types';

export const USER_AVATARS = [
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBCyZSmgTfBX2yPM_FTYYHtJ7B7REWNJJUBVFRCnFE1dhCnQGEslaz1RzhrNXD1ICLCKMk2thxqkt3ahsT6FNugzBwcjp9K4-oTxteJm40aGtAeT6XUAt6sC7r8zvufP0K46oKEowiJQW5XUWJk7PVMdY7LD0mIc1QBFtJJaBG0DMn5ry7XfX4c2yL704AIsFnP5AR-Ri_zJ_v5xcwX27NVqV5q0moovrud9ICUvVkNq_fVg0q9y6kFG3kfBUCF3z3ZmvyhlyJ44knf",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBNvvPOTQxf1QcHKvZhD80lyxpPMgbNkyvjTgiCTykVzk0dS-9i4wmluzCczv2Lj2bVTZJKjLT_FcZHUaeBn1JpegqN76ReeWVbE_4bTPfzKe7uxmXkNNsiIJKUikWsiHo2gePw-V3PZ_mVeMZjaHMw5vs8_gYXSo935fs-5Qccgse90kFQZuz1JcqpiTDsysjzZPCff5YEyvLpuJct75lotV_fI_nMOcFhCBnESmXJjGnLzaoVSCj1jd3BAOxUuURH67ZxEV9dZCB5",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCMAbewXAsLOrkpuE7dOKlFrOSbFEI-I9Vbj9YqdyxTyS2U-pl6LWpGUwbux3yh8_TwA3xl-fBjXRWYeGA70r_4nVIFCd5OkXn427AwCuR6kq0bmhXWbsx-1aWcJQLry64ynaSedyTJvZbDeOV0DlnSGGTLWgzTjSoL3rxVmX4b6-TXskaGLrQNMtGOvu_qtuOqBKNGTZOPmpZLVXgfe173ax8tm27xXNeWf3ZlA8C6wdVbD4Sh-NUYga8TPwDhdpAenqjG7bRbCGZg"
];

export const MOCK_PROJECTS: Project[] = [
  { id: 'PRJ-2023-001', name: 'Residencial Jardins', client: 'Construtora Viver Bem', status: 'ANALYSIS', team: [USER_AVATARS[0], USER_AVATARS[1]], value: 45000, deadline: '15 Out', type: 'business' },
  { id: 'PRJ-2023-045', name: 'Fábrica Motors Sul', client: 'Grupo Motors', status: 'EXECUTION', team: [USER_AVATARS[0], USER_AVATARS[2]], value: 120000, deadline: '30 Out', type: 'factory' },
  { id: 'PRJ-2023-089', name: 'Shopping Plaza', client: 'Investimentos S.A.', status: 'DONE', team: [USER_AVATARS[1]], value: 8500, deadline: '12 Out', type: 'store' }
];

export const MOCK_TASKS: Task[] = [
  { id: 'T-1', title: 'Revisar Projeto Alpha', deadline: 'Hoje, 14:00', priority: 'HIGH', completed: false, status: 'PENDING' },
  { id: 'T-2', title: 'Enviar cotação Shopping Sul', deadline: 'Amanhã', priority: 'MEDIUM', completed: false, status: 'BUYING' },
  { id: 'T-3', title: 'Aprovar NF-e 4022', deadline: 'Concluído', priority: 'LOW', completed: true, status: 'DONE' },
  { id: 'T-4', title: 'Agendar vistoria técnica', deadline: '12 Out', priority: 'LOW', completed: false, status: 'PENDING' },
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  { date: '12 Ago 2023', description: 'Instalação Sprinklers', category: 'Serviços', entity: 'Condomínio Solar', status: 'PAID', value: 25000, type: 'INCOME' },
  { date: '11 Ago 2023', description: 'Tubulação de Cobre', category: 'Material', entity: 'Aço Forte Ltda.', status: 'PENDING', value: 5000, type: 'EXPENSE' },
  { date: '10 Ago 2023', description: 'Combustível Frota', category: 'Transporte', entity: 'Posto Shell', status: 'PAID', value: 400, type: 'EXPENSE' }
];
