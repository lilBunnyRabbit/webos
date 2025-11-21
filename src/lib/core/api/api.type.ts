export interface IService {
  name: string;
}

export interface ServiceDescriptor<T extends IService> {
  instance: new () => T;
  dependencies?: string[];
  // priority?: number;
}