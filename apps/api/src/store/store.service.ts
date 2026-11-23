import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { DEFAULT_DB_PATH, Store } from '@takam/store';

/**
 * The store (libs/store) as a Nest provider: opened once when the API starts,
 * closed on shutdown. All the reading methods come from `Store`.
 */
@Injectable()
export class StoreService extends Store implements OnModuleDestroy {
  constructor() {
    super(process.env.DB_PATH ?? DEFAULT_DB_PATH);
  }

  onModuleDestroy() {
    this.close();
  }
}
