export declare class YamlCodec {
    private readonly yaml?;
    constructor();
    stringify(value: unknown): string;
    parse(text: string): unknown;
}
