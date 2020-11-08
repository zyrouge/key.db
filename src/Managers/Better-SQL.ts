import { Config, checkConfig, isBetterSQLDialect } from "../Utils/Configuration";
import { Err } from "../Utils/Error";
import { isArray, isObject, isString, isUndefined } from "lodash";
import Sqlite from "better-sqlite3";
import { BaseCache, BaseDB, isBaseCacheConstructor, isBaseCacheInstance, Memory, Pair } from "./Base";
import { EventEmitter } from "events";
import path from "path";
import * as DataParser from "../Utils/DataParser";
import Constants from "../Utils/Constants";
import { KeyParams, isKeyNdNotation, DotNotations, isValidLiteral } from "../Utils/DBUtils";
import fs from "fs-extra";

/**
 * The Better-SQL DB Client
 *
 * Refer all the Events here: {@link BaseDB.on}
 *
 * Example:
 * ```js
 * const Database = new Keyvify.BetterSQL("database", config);
 * ```
 */
export class BetterSQL extends EventEmitter implements BaseDB {
    public readonly name: string;
    public readonly type = "better-sqlite";
    public connected: boolean;
    public readonly serializer: (input: any) => string;
    public readonly deserializer: (input: string) => any;
    protected readonly cache?: BaseCache;
    protected readonly sqlite: Sqlite.Database;

    public constructor(name: string, config: Config) {
        super();

        if (!name) throw new Err(...Constants.NO_DB_NAME);
        if (!isString(name) || !isValidLiteral(name)) throw new Err(...Constants.INVALID_DB_NAME);
        if (!config) throw new Err(...Constants.NO_CONFIG);
        checkConfig(config, false);
        if (!isBetterSQLDialect(config.dialect)) throw new Err(...Constants.INVALID_DIALECT);
        if (!config.storage) throw new Err(...Constants.NO_SQLITE_STORAGE);
        if (!isString(config.storage)) throw new Err(...Constants.INVALID_SQLITE_STORAGE);

        const storagePath = path.isAbsolute(config.storage)
            ? config.storage
            : path.join(process.cwd(), config.storage);
        fs.ensureFileSync(storagePath);
        
        this.name = name;
        this.sqlite = config.dialect instanceof Sqlite ? config.dialect : new Sqlite(storagePath);

        if (config.cache !== false) {
            if (isBaseCacheConstructor(config.cache)) this.cache = new config.cache();
            else if (isBaseCacheInstance(config.cache)) this.cache = config.cache;
            else this.cache = new Memory();
        }

        this.connected = false;

        this.serializer = config.serializer || DataParser.serialize;
        this.deserializer = config.deserializer || DataParser.deserialize;
    }

    public async connect() {
        if (!this.sqlite.open) throw new Err(...Constants.ERROR_OPENING_CONNECTION);
        const cnt = this.sqlite.prepare("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?;").get(this.name);

        if (!cnt["count(*)"]) {
            this.sqlite.prepare(`
                CREATE TABLE ${this.name} (
                    key text NOT NULL PRIMARY KEY,
                    value text
                );
            `).run();

            this.sqlite.pragma("synchronous = 1;");
            this.sqlite.pragma("journal_mode = WAL;");
        }

        this.connected = true;
        this.emit("connect");
    }

    public async disconnect() {
        this.sqlite.close();
        this.connected = false;
        this.emit("disconnect");
    }

    public async get(kpar: KeyParams) {
        if (!isKeyNdNotation(kpar)) throw new Err(...Constants.INVALID_PARAMETERS);

        let key: string, dotNot: string | undefined;
        if (isArray(kpar)) [key, dotNot] = kpar;
        else key = kpar;

        const pair = await this.getKey(key);
        if (dotNot) {
            if(!isObject(pair.value)) throw new Err(...Constants.VALUE_NOT_OBJECT);
            pair.value = DotNotations.getKey(pair.value, dotNot);
        }
        this.emit("valueGet", pair);
        return pair;
    }

    protected async getKey(key: string) {
        if (!key) throw new Err(...Constants.NO_KEY);
        if (!isString(key)) throw new Err(...Constants.INVALID_KEY);

        let rval = this.cache?.get(key);
        if (isUndefined(rval)) {
            const raw = this.sqlite.prepare(`SELECT * FROM ${this.name} WHERE key = ?;`).get(key);
            if (raw && raw.value) rval = raw.value;
        }

        return new Pair(key, this.deserializer(`${rval}`));
    }

    async set(kpar: KeyParams, value: any) {
        if (!isKeyNdNotation(kpar)) throw new Err(...Constants.INVALID_PARAMETERS);

        let key: string, dotNot: string | undefined;
        if (isArray(kpar)) [key, dotNot] = kpar;
        else key = kpar;

        const pair = await this.getKey(key);
        pair.old = pair.value;

        if (dotNot) {
            if (!isObject(pair.old)) throw new Err(...Constants.VALUE_NOT_OBJECT);
            pair.value = DotNotations.setKey(pair.old, dotNot, value);
        } else pair.value = value;

        const npair = await this.setKey(pair.key, pair.value);
        if (pair.old) npair.old = pair.old;
        this.emit(pair.old ? "valueUpdate" : "valueSet", npair);
        return npair;
    }

    protected async setKey(key: string, value: any) {
        if (!key) throw new Err(...Constants.NO_KEY);
        if (!isString(key)) throw new Err(...Constants.INVALID_KEY);
        if (!value) throw new Err(...Constants.NO_VALUE);
        const serval = this.serializer(value);
        let oldVal: any;

        let mod = this.sqlite.prepare(`SELECT * FROM ${this.name} WHERE key = ?;`).get(key);;
        if (mod && mod.value) {
            oldVal = this.deserializer(`${mod.value}`);
            this.sqlite.prepare(`UPDATE ${this.name} SET value = ? WHERE key = ?;`).run(serval, key);
        } else this.sqlite.prepare(`INSERT INTO ${this.name} (key, value) VALUES (?, ?);`).run(key, serval);
        this.cache?.set(key, serval);
        
        const pair: Pair = new Pair(key, this.deserializer(serval));
        if (oldVal) pair.old = oldVal;
        return pair;
    }

    public async delete(key: string) {
        if (!key) throw new Err(...Constants.NO_KEY);
        if (!isString(key)) throw new Err(...Constants.INVALID_KEY);

        const { changes: totalDeleted } = this.sqlite.prepare(`DELETE FROM ${this.name} WHERE key = ?;`).run(key);
        this.cache?.delete(key);
        this.emit("valueDelete", key, totalDeleted);
        return totalDeleted;
    }

    public async truncate() {
        const { changes: totalDeleted } = this.sqlite.prepare(`DELETE FROM ${this.name}`).run();
        this.emit("truncate", totalDeleted);
        return totalDeleted;
    }

    public async all() {
        const allMods = this.sqlite.prepare(`SELECT * FROM ${this.name}`).all();
        this.cache?.empty();
        const allKeys = allMods.map(({ key, value: rvalue }) => {
            this.cache?.set(key, rvalue);
            return new Pair(key, this.deserializer(rvalue));
        });

        this.emit("valueFetch", allKeys);
        return allKeys;
    }

    public empty() {
       this.cache?.empty();
    }

    public entries() {
        return this.cache?.entries() || [];
    }
}