export type BrandedType<T, BrandName extends string> = T & { __brand: BrandName };

export type FlavoredType<T, FlavorName extends string> = T & { __flavor?: FlavorName };

export type HexString<Length extends number = number> = FlavoredType<
  string & {
    readonly length: Length;
  },
  'HexString'
>;

export type PrefixedHexString = BrandedType<string, 'PrefixedHexString'>;
