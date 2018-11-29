const initConfig = require('../initConfig.js');
const fs = require('fs');
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const fieldsMap = require('./propertyFieldsMap.js').fieldsMap;
const thisFilename = 'database.js';
const _ = require('underscore');
const moment = require('moment');

async function updateData(updateDataObj, propertyId, user_id) {
	// TODO: if there is no propertyId, throw error

	// iterate through updateDataObj
	// key is the field name, value is an object that might look like this {value: x, verify: y}
	// given the property id, the field name, and the value, we want to update the information
	for (var field in updateDataObj) {
		if (_.has(fieldsMap, field) && fieldsMap[field].active) {

			var value = updateDataObj[field].value;
			var verify = updateDataObj[field].verify;

			console.log(verify);

			// update PropertyVerifications
			if (!(verify == undefined)) {
				var verifyExists = await query(
					'AffordableHousingDataHub',
					`SELECT id from PropertyVerifications WHERE field = '${field}' AND property_id = ${propertyId}`
				);

				if (verifyExists.length > 0) {
					var verifyId = verifyExists[0].id;
					await query(
						'AffordableHousingDataHub',
						`UPDATE PropertyVerifications SET verified = ${verify}, last_updated = '${moment().format('YYYY-MM-DD HH:mm:ss')}', updated_by_user_id=${user_id} WHERE id = ${verifyId}`
					);
				} else {
					await query(
						'AffordableHousingDataHub',
						`INSERT INTO PropertyVerifications (verified, property_id, field, last_updated, updated_by_user_id) VALUES (${mysql.escape(verify)}, ${mysql.escape(propertyId)}, ${mysql.escape(field)}, '${moment().format('YYYY-MM-DD HH:mm:ss')}', ${user_id})`
					);
				}

			}

			// value could be null for example if they put unknown
			if (!_.isUndefined(value)) {
				// check that field is in fieldsMap, and that it is active
				// run sql command to update that one field
				await query(
					'AffordableHousingDataHub',
					`UPDATE Properties SET ${field} = ${mysql.escape(value)} WHERE id =${mysql.escape(propertyId)}`
				);
			}
		}
	}
}

async function updateSessionId(userId, sessionId) {
	return new Promise(async (resolve, reject) => {
		var error = null;

		try {
			var conn = await getDatabaseConnection();
			var sql = `UPDATE Users SET session_id =${mysql.escape(sessionId)} WHERE id=${mysql.escape(userId)}`;
			await queryDatabase(conn, 'AffordableHousingDataHub', sql);
		} catch(e) {
			error = new Error(thisFilename + ' => updateSessionID(), caught exception:\n' + e.stack);
		} finally {
			await closeDatabaseConnection(conn);
			if (error) {
				return reject(error);
			} else {
				return resolve(true);
			}
		}
	});
}

async function doesUserExist(email, pass) {
	return new Promise(async (resolve, reject) => {
		var error = null;

		try {
			var conn = await getDatabaseConnection();
			var res = await queryDatabase(
				conn,
				'AffordableHousingDataHub',
				`SELECT * FROM Users WHERE email=${mysql.escape(email)}`
			);
			if (res.length > 1) {
				return reject(new Error(thisFilename + ' => doesUserExist(), multiple users found but one expected'));
			}
			if (res.length == 0) {
				return resolve(false)
			}
			if (bcrypt.compareSync(pass, res[0].passwd)) {
				return resolve(res);
			} else {
				return resolve(false);
			}
		} catch(e) {
			error = new Error(thisFilename + ' => doesUserExist(), caught exception:\n' + e.stack);
		} finally {
			closeDatabaseConnection(conn);
			if (error) {
				return reject(error);
			} else {
				return resolve(res);
			}
		}
	});
}

async function getUser(email) {
	try {
		var conn = await getDatabaseConnection();
		var res = await queryDatabase(
			conn,
			'AffordableHousingDataHub',
			`SELECT * FROM Users WHERE email = ${mysql.escape(email)}`
		);
		await closeDatabaseConnection(conn);

		if (res.length > 1) {
		// if (true) {
			throw new Error('getUser() found multiple users');
		}
	} catch (e) {
		throw new Error(thisFilename + ' => getUser(), caught exception:\n' + e.stack);
	}
	return res;
}

async function createUser(firstName, lastName, org, email, passwd) {
	return new Promise(async (resolve, reject) => {
		try {
			var conn = await getDatabaseConnection();
			var passwdHash = bcrypt.hashSync(passwd, 11);
			var results = await queryDatabase(
				conn,
				'AffordableHousingDataHub',
				`INSERT INTO Users (first_name, last_name, org, email, passwd) VALUES (${mysql.escape(firstName)}, ${mysql.escape(lastName)}, ${mysql.escape(org)}, ${mysql.escape(email)}, ${mysql.escape(passwdHash)})`
			);
			await closeDatabaseConnection(conn);
		} catch(e) {
			await closeDatabaseConnection(conn);
			return reject(new Error(thisFilename + ' => createUser(), caught exception:\n' + e.stack)); // TODO: is this right?
		}

		return resolve(results)
	});
}

async function getUpdatePropertiesList() {
	// TODO: properly handle errors
	// var conn = await getDatabaseConnection();
	// var res = await queryDatabase(
	// 	conn,
	// 	'AffordableHousingDataHub',
	// 	'SELECT id, property_name, address, phone, email, website, total_income_restricted_units, total_section_8_units, zipcode FROM Properties'
	// );
	// await closeDatabaseConnection(conn);

	var res = query(
		'AffordableHousingDataHub',
		'SELECT property_name, data_source_ahi, data_source_tdhca, data_source_atc_guide, Properties.id, property_name, address, phone, Properties.email as email, website, total_income_restricted_units, total_section_8_units, zipcode, Users.email as assigned_user_email FROM Properties LEFT JOIN Users ON Properties.assigned_user_id = Users.id WHERE is_duplicate != 1'
	);

	return res;
}

async function getAllProperties() {
	var includeFields = [
		'id',
		'property_name',
		'address',
		'city',
		'state',
		'zipcode',
		'lat',
		'longitude',
		'unit_type',
		'council_district',
		'phone',
		'email',
		'website',
		'students_only',
		'community_elderly',
		'community_disabled',
		'community_domestic_abuse_survivor',
		'community_mental',
		'community_military',
		'community_served_descriptions',
		'broken_lease',
		'broken_lease_criteria',
		'eviction_history',
		'eviction_history_criteria',
		'criminal_history',
		'criminal_history_criteria',
		'has_waitlist',
		'total_units',
		'total_psh_units',
		'total_income_restricted_units',
		'accepts_section_8',
		'total_public_housing_units',
		'num_units_mfi_30',
		'num_units_mfi_40',
		'num_units_mfi_50',
		'num_units_mfi_60',
		'num_units_mfi_70',
		'num_units_mfi_80',
		'num_units_mfi_90',
		'num_units_mfi_100',
		'num_units_mfi_110',
		'num_units_mfi_120',
		'has_playground',
		'has_pool',
		'has_off_street_parking',
		'has_air_conditioning',
		'has_ceiling_fans',
		'wd_unit',
		'wd_hookups',
		'wd_onsite',
		'wd_other',
		'allows_pet',
		'pet_other',
		'security',
		'elementary_school',
		'middle_school',
		'high_school',
		'affordability_expiration',
		'has_available_affordable_units'
	];
	var fieldsString = includeFields.join(', ');
	var res = query(
		'AffordableHousingDataHub',
		`SELECT ${fieldsString} FROM Properties WHERE is_duplicate != 1`
	);
	return res;
}

// create conn, do query, close connection
async function query(db, query) {
	// in order to test your theory, your theory is that you don't need a try catch, because
	// you don't need to catch an error here, if there is an error, then it should be caught in a more upstream
	// block, but if there is an error in queryDatabase for example, does that mean that closeDatbaseConnection will
	// not be called?

	// try {
		var conn = await getDatabaseConnection();
		var res = await queryDatabase(
			conn,
			db,
			query
		);
		await closeDatabaseConnection(conn);
	// } catch (e) {
		// await closeDatabaseConnection(conn);
		// throw e;
	// }

	return res;
}

async function getProperty(id) {
	// TODO: properly handle errors
	// var conn = await getDatabaseConnection();
	// var res = await queryDatabase(
	// 	conn,
	// 	'AffordableHousingDataHub',
	// 	`SELECT * from Properties WHERE id = ${id}`
	// );
	// await closeDatabaseConnection(conn);

	var res = await query(
		'AffordableHousingDataHub',
		`SELECT * from Properties WHERE id = ${id}`
	);
	return res;
}

async function getPropertyVerifications(id) {
	function reformat(result) {
		var obj = {};
		if (res.length > 0) {
			for (var r of res) {
				obj[r.field] = {verified: r.verified, lastUpdated: r.last_updated, updateUserEmail: r.email}
			}
			return obj;
		} else {
			return null; // TODO: change this to return empty object like in getAllPropertyVerifications
		}
	}

	// TODO: error handling
	var res = await query(
		'AffordableHousingDataHub',
		`SELECT  * from PropertyVerifications LEFT JOIN Users ON updated_by_user_id = Users.id WHERE property_id = ${id} `
	);
	return reformat(res);
}

async function getAllPropertyVerifications() {
	function reformat(result) {
		var obj = {};
		if (res.length > 0) {
			for (var r of res) {
				if (!_.has(obj, r.property_id)) {
					obj[r.property_id] = {}
				}
				obj[r.property_id][r.field] = r.verified;
			}
			return obj;
		} else {
			return {};
		}
	}
	var res = await query(
		'AffordableHousingDataHub',
		`SELECT * from PropertyVerifications`
	);
	return reformat(res);
}

async function getPropertyAssignedUser(id) {
	var res = await query(
		'AffordableHousingDataHub',
		`SELECT assigned_user_id, Users.email from Properties INNER JOIN Users ON Properties.assigned_user_id = Users.id WHERE Properties.id = ${id}`
	);
	return res;
}

async function unassignUser(id) {
	// TODO: need to error handle properly
	if (id) {
		var res = await query(
			'AffordableHousingDataHub',
			`UPDATE Properties SET assigned_user_id = NULL WHERE id = ${id}`
		);
		return true
	}
	return false;
}

async function createProperty(name, address, city, state, zip) {
	var result = await query(
		'AffordableHousingDataHub',
		`INSERT INTO Properties (property_name, address, city, state, zipcode) VALUES (${mysql.escape(name)}, ${mysql.escape(address)}, ${mysql.escape(city)}, ${mysql.escape(state)}, ${mysql.escape(zip)}) `
	);
	return result;
}

async function assign_property_to_user(propertyId, userId) {
	// TODO: need to error handle properly, mysql escape string
	if (propertyId && userId) {
		var res = await query(
			'AffordableHousingDataHub',
			`UPDATE Properties SET assigned_user_id = ${userId} WHERE id = ${propertyId}`
		);
		return res;
	}
	return null;
}

async function queryDatabase(mysqlConnection, database, query) {
	return new Promise((resolve, reject) => {
		mysqlConnection.query(`use ${database}`);

		mysqlConnection.query(query, (e, results, fields) => {
			if (e) {
				return reject(new Error(thisFilename + ' => queryDatabase(), error in query:\n' + e.stack));
			}
			return resolve(results);
		});
	});
}

function closeDatabaseConnection(mysqlConnection) {
	if (!mysqlConnection || !mysqlConnection.threadId) {
		return;
	}
	try {
		mysqlConnection.end((e) => {
			if (e) {
				throw new Error(thisFilename + ' => closeDatabaseConnection(), unable to close connection:\n' + e);
			}
		});
	} catch(e) {
		throw new Error(thisFilename + ' => closeDatabaseConnection(), caught exception:\n' + e);
	}
}

async function getDatabaseConnection() {
	return new Promise((resolve, reject) => {
		try {
			if (process.env.NODE_ENV == 'DEVELOPMENT') {
				 var conn = mysql.createConnection({
					socketPath: fs.readFileSync(initConfig.configPath.trim() + 'db_socket_path.txt', 'utf8'),
					user: fs.readFileSync(initConfig.configPath.trim() + 'db_user.txt', 'utf8'),
					password: fs.readFileSync(initConfig.configPath.trim() + 'db_pass.txt', 'utf8'),
				});
			} else if (process.env.NODE_ENV == 'PRODUCTION') {
				 var conn = mysql.createConnection({
					user: fs.readFileSync(initConfig.configPath.trim() + 'db_user.txt', 'utf8').trim(),
					password: fs.readFileSync(initConfig.configPath.trim() + 'db_pass.txt', 'utf8').trim(),
					host:'localhost',
					database: 'AffordableHousingDataHub'
				});
				// TODO: facillitate connection to internet socket (probs hosted on aws)
			}

			conn.connect((e) => {
				if (e) {
					conn.end(() => {}); // assume that this correctly ends the connection
					return reject(new Error(thisFilename + ' => getDatabaseConnection(), unable to connect to database:\n' + e.stack));
				}
				return resolve(conn);
			});

		} catch(e) {
			return reject(new Error(thisFilename + ' => getDatabaseConnection(), caught exception:\n' + e.stack));
		}
	});
}

module.exports.getDatabaseConnection = getDatabaseConnection;
module.exports.closeDatabaseConnection = closeDatabaseConnection;
module.exports.createUser = createUser;
module.exports.doesUserExist = doesUserExist;
module.exports.queryDatabase = queryDatabase;
module.exports.getUpdatePropertiesList = getUpdatePropertiesList;
module.exports.getProperty = getProperty;
module.exports.updateSessionId = updateSessionId;
module.exports.getUser = getUser;
module.exports.query = query;
module.exports.updateData = updateData;
module.exports.getPropertyAssignedUser = getPropertyAssignedUser;
module.exports.unassignUser = unassignUser;
module.exports.assign_property_to_user = assign_property_to_user;
module.exports.getPropertyVerifications = getPropertyVerifications;
module.exports.getAllPropertyVerifications = getAllPropertyVerifications;
module.exports.getAllProperties = getAllProperties;
module.exports.createProperty = createProperty;

