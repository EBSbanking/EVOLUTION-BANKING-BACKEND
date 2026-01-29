// utils/dbHelpers.js
import { getConnection } from '../../config/db.js';

export const findOne = async (table, conditions) => {
  const connection = await getConnection();
  try {
    const whereClause = Object.keys(conditions)
      .map(key => `${key} = ?`)
      .join(' AND ');
    
    const query = `SELECT * FROM ${table} WHERE ${whereClause} LIMIT 1`;
    const values = Object.values(conditions);
    
    const [rows] = await connection.execute(query, values);
    return rows[0] || null;
  } finally {
    connection.release();
  }
};

export const find = async (table, conditions = {}, options = {}) => {
  const connection = await getConnection();
  try {
    let query = `SELECT * FROM ${table}`;
    const values = [];
    
    if (Object.keys(conditions).length > 0) {
      const whereClause = Object.keys(conditions)
        .map(key => `${key} = ?`)
        .join(' AND ');
      query += ` WHERE ${whereClause}`;
      values.push(...Object.values(conditions));
    }
    
    if (options.sort) {
      query += ` ORDER BY ${options.sort.field} ${options.sort.order || 'ASC'}`;
    }
    
    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }
    
    const [rows] = await connection.execute(query, values);
    return rows;
  } finally {
    connection.release();
  }
};

export const create = async (table, data) => {
  const connection = await getConnection();
  try {
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);
    
    const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
    const [result] = await connection.execute(query, values);
    return result.insertId;
  } finally {
    connection.release();
  }
};

export const update = async (table, conditions, data) => {
  const connection = await getConnection();
  try {
    const setClause = Object.keys(data)
      .map(key => `${key} = ?`)
      .join(', ');
    
    const whereClause = Object.keys(conditions)
      .map(key => `${key} = ?`)
      .join(' AND ');
    
    const query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    const values = [...Object.values(data), ...Object.values(conditions)];
    
    const [result] = await connection.execute(query, values);
    return result.affectedRows > 0;
  } finally {
    connection.release();
  }
};

export const remove = async (table, conditions) => {
  const connection = await getConnection();
  try {
    const whereClause = Object.keys(conditions)
      .map(key => `${key} = ?`)
      .join(' AND ');
    
    const query = `DELETE FROM ${table} WHERE ${whereClause}`;
    const values = Object.values(conditions);
    
    const [result] = await connection.execute(query, values);
    return result.affectedRows > 0;
  } finally {
    connection.release();
  }
};