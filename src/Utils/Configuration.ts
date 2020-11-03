import { Sequelize, Dialect as SequelizeDialectsDefTypes } from "sequelize";
import { Mongoose } from "mongoose";
import BSQLConstructor, { Database as BSQLDatabse } from "better-sqlite3";
import { Err } from "./Error";
import Constants from "./Constants";
import { isString, isNumber, isFunction, isBoolean } from "lodash";

export type SequelizeDialectsType = SequelizeDialectsDefTypes | Sequelize;
export type MongoDBType = "mongodb" | Mongoose;
export type BetterSQLiteType = "better-sqlite" | BSQLDatabse;
export type SupportedDialectsType = SequelizeDialectsType | MongoDBType | BetterSQLiteType;

/**
 * Keyvify Configuration (Common for all Dialects)
 * 
 * Example:
 * 
 * SQLite
 * ```js
 * const config = {
 *      dialect: "sqlite",
 *      storage: "./database.sqlite"
 * }
 * ```
 * 
 * Postgres
 * ```js
 * const config = {
 *      dialect: "postgres",
 *      username: "someuser",
 *      password: "youshallnotpass",
 *      host: "localhost",
 *      port: "8080"
 * }
 * ```
 * 
 * MongoDB
 * ```js
 * const config = {
 *      dialect: "mongodb",
 *      uri: "mongodb://mongodb0.example.com:27017"
 * }
 * ```
 */
export interface Config {

    /**
     * Username of the Database
     */
    username?: string;

    /**
     * Password of the Database
     */
    password?: string;

    /**
     * Database name
     */
    database?: string;

    /**
     * Database's host
     */
    host?: string;

    /**
     * Database's Port
     */
    port?: number;

    /**
     * MongoDB URL (only when using MongoDB)
     */
    uri?: string;

    /**
     * Path to Database file (only when using SQLite)
     */
    storage?: string;

    /**
     * Can be a Dialect name or the instance of it. Refer all the Dialects here: {@link SupportedDialectsType}
     */
    dialect: SupportedDialectsType;

    /**
     * Whether to disable caching
     */
    disableCache?: boolean;

    /**
     * Data serializer
     */
    serializer?: (input: any) => string;

    /**
     * Data deserializer
     */
    deserializer?: (input: string) => any;
}

export function checkConfig(config: Config, checkDialect: boolean = true) {
    if (config.username && !isString(config.username)) throw new Err("Invalid username", "INVALID_USERNAME");
    if (config.password && !isString(config.password)) throw new Err("Invalid password", "INVALID_PASSWORD");
    if (config.database && !isString(config.database)) throw new Err("Invalid database", "INVALID_DATABASE");
    if (config.host && !isString(config.host)) throw new Err("Invalid host", "INVALID_HOST");
    if (config.port !== undefined && !isNumber(config.uri)) throw new Err("Invalid port", "INVALID_PORT");
    if (config.uri && !isString(config.uri)) throw new Err("Invalid URI", "INVALID_URI");
    if (config.storage && !isString(config.storage)) throw new Err("Invalid storage", "INVALID_STORAGE");
    if (checkDialect && !config.dialect) throw new Err(...Constants.NO_DIALECT);
    if (checkDialect && !isSupportedDialect(config.dialect)) throw new Err(...Constants.INVALID_DIALECT);
    if (config.disableCache !== undefined && !isBoolean(config.disableCache)) throw new Err("Invalid cache option", "INVALID_CACHE_OPTION");
    if (config.serializer && !isFunction(config.serializer)) throw new Err("Invalid serializer", "INVALID_SERIALIZER");
    if (config.deserializer && !isFunction(config.deserializer)) throw new Err("Invalid deserializer", "INVALID_DESERIALIZER");
}

export const SequelizeDialectsStrs = ["mysql", "postgres", "sqlite", "mariadb", "mssql"];
export const SupportedDialectsStrs = [...SequelizeDialectsStrs, "mongodb", "better-sqlite"];

export function isSupportedDialect(dialect: any): dialect is SupportedDialectsType {
    if (SupportedDialectsStrs.includes(dialect)) return true;
    if (
        isSequelizeDialect(dialect) ||
        isMongoDialect(dialect) ||
        isBetterSQLDialect(dialect)
    ) return true;
    return false;
}

export function isSequelizeDialect(dialect: any): dialect is SequelizeDialectsType {
    if (SequelizeDialectsStrs.includes(dialect)) return true;
    if (dialect instanceof Sequelize) return true;
    return false;
}

export function isMongoDialect(dialect: any): dialect is MongoDBType {
    if (dialect === "mongodb") return true;
    if (dialect instanceof Mongoose) return true;
    return false;
}

export function isBetterSQLDialect(dialect: any): dialect is BetterSQLiteType {
    if (dialect === "better-sqlite") return true;
    if (dialect instanceof BSQLConstructor) return true;
    return false;
}