import { Column, CreatedAt, DataType, Default, Model, PrimaryKey, Table, UpdatedAt } from 'sequelize-typescript';

export type OutboxStatus = 'pending' | 'published' | 'failed';

/**
 * Outbox table — events are written here BEFORE being published to RabbitMQ.
 * A scheduler periodically republishes any rows still in `pending` state,
 * which guarantees delivery even if the broker is temporarily unavailable.
 */
@Table({ tableName: 'outbox_events', timestamps: true })
export class OutboxEvent extends Model<OutboxEvent> {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare type: string;

  @Default({})
  @Column({ type: DataType.JSONB, allowNull: false })
  declare payload: Record<string, any>;

  @Column({ type: DataType.DATE, allowNull: false })
  declare timestamp: Date;

  @Default('pending')
  @Column({ type: DataType.STRING(16), allowNull: false })
  declare status: OutboxStatus;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare attempts: number;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare lastError: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare publishedAt: Date | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
