import { Injectable } from '@nestjs/common';
import { DirectiveSearch } from '@takam/search';
import { StoreService } from '../store/store.service';
import { toSearchable } from './searchable';

/**
 * The search index (libs/search), built in memory from the store once, when
 * the API starts. A new ingest needs an API restart to be searchable.
 */
@Injectable()
export class SearchService {
  readonly index: DirectiveSearch;

  constructor(store: StoreService) {
    this.index = new DirectiveSearch(store.listDirectives().map(toSearchable));
  }
}
