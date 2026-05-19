import { Column, CreatedAt, DataType, Default, Model, PrimaryKey, Table, UpdatedAt } from 'sequelize-typescript';

export type ProcessingStatus = 'success' | 'failed' | 'dead_lettered';

/**
 * Persistent log of event processing — used for:
 *   1. Idempotency: composite PK (id, consumer) plus an `upsert` so the same
 *      event can never produce two `success` rows for the same consumer.
 *   2. Persistent retry counter: `attempts` survives consumer restarts.
 *   3. Audit / failure analysis: lastError + processedAt are kept.
 *
 * The composite primary key lets multiple consumers (e.g. the generic events
 * consumer and the telegram-notifier) track the same event independently.
 */
@Table({ tableName: 'processed_events', timestamps: true })
export class ProcessedEvent extends Model<ProcessedEvent> {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @PrimaryKey
  @Column(DataType.STRING(64))
  declare consumer: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare type: string;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare status: ProcessingStatus;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare attempts: number;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare lastError: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare processedAt: Date | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
