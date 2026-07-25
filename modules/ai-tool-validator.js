'use strict';

// 手写 JSON-schema 参数校验器（无 ajv 依赖）。仅支持 SPEDMIS 两个只读工具所需的
// 关键字，但 additionalProperties 默认 false——这是核心注入防御：模型传入的未知参数
// 键一律拒绝（never reach dispatcher）。
//
// 用法：validateArguments(argsRaw, schema) → { ok, value, errors }
//   argsRaw：模型的 tool_call.function.arguments（字符串，通常为 JSON 对象）
//   schema ：工具的 parameters JSON schema
//   ok     ：校验是否通过
//   value  ：仅含已知键且经校验的对象（未知键被丢弃）；ok=false 时为 null
//   errors ：人类可读的错误说明数组

const TYPE_CHECKERS = {
    string: (value) => typeof value === 'string',
    integer: (value) => Number.isInteger(value),
    number: (value) => typeof value === 'number' && Number.isFinite(value),
    boolean: (value) => typeof value === 'boolean',
    array: (value) => Array.isArray(value),
    object: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
};

function validateValue(value, subschema, path, errors) {
    if (!subschema || typeof subschema !== 'object') {
        return;
    }
    if (subschema.type && TYPE_CHECKERS[subschema.type]) {
        if (!TYPE_CHECKERS[subschema.type](value)) {
            errors.push(`${path} 应为 ${subschema.type} 类型`);
            return;
        }
    }
    if (Array.isArray(subschema.enum) && !subschema.enum.includes(value)) {
        errors.push(`${path} 取值不在允许范围`);
        return;
    }
    if (subschema.type === 'integer' || subschema.type === 'number') {
        if (typeof subschema.minimum === 'number' && value < subschema.minimum) {
            errors.push(`${path} 小于最小值 ${subschema.minimum}`);
        }
        if (typeof subschema.maximum === 'number' && value > subschema.maximum) {
            errors.push(`${path} 大于最大值 ${subschema.maximum}`);
        }
    }
    if (subschema.type === 'string' && typeof subschema.maxLength === 'number' && value.length > subschema.maxLength) {
        errors.push(`${path} 超过最大长度 ${subschema.maxLength}`);
    }
    if (subschema.type === 'array' && subschema.items) {
        for (let index = 0; index < value.length; index += 1) {
            validateValue(value[index], subschema.items, `${path}[${index}]`, errors);
        }
    }
}

function validateArguments(argsRaw, schema) {
    const errors = [];
    const value = {};

    let args = argsRaw;
    if (typeof args === 'string') {
        if (args.trim() === '') {
            args = {};
        } else {
            try {
                args = JSON.parse(args);
            } catch {
                return { ok: false, value: null, errors: ['工具参数解析失败（期望 JSON 对象）。'] };
            }
        }
    }
    if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        return { ok: false, value: null, errors: ['工具参数必须是 JSON 对象。'] };
    }

    const properties = (schema && schema.properties) || {};
    const additionalAllowed = Boolean(schema && schema.additionalProperties === true);
    const required = Array.isArray(schema && schema.required) ? schema.required : [];

    for (const key of Object.keys(args)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
            if (!additionalAllowed) {
                errors.push(`未知参数：${key}`);
            }
            continue;
        }
        validateValue(args[key], properties[key], key, errors);
        value[key] = args[key];
    }

    for (const key of required) {
        if (!Object.prototype.hasOwnProperty.call(args, key)) {
            errors.push(`缺少必填参数：${key}`);
        }
    }

    return { ok: errors.length === 0, value, errors };
}

module.exports = {
    validateArguments,
};
