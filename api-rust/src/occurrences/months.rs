use std::path::Path;

use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, OpenFlags, params_from_iter};

use super::OccurrencesIndex;
use super::query::{LiferHotspot, ResolvedSpecies};

pub const MONTHS_IN_YEAR: usize = 12;
const MMAP_SIZE: i64 = 1 << 40;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MonthSettings {
    pub min_checklists: f64,
    pub score_scale: f64,
}

pub struct MonthHotspotQuery<'a> {
    pub seen: &'a ResolvedSpecies,
    pub months: &'a [u8],
    pub frequency: f64,
    pub min_checklists: f64,
    pub region_codes: &'a [String],
    pub limit: usize,
}

fn open(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(sql_err)?;
    conn.pragma_update(None, "mmap_size", MMAP_SIZE)
        .map_err(sql_err)?;
    Ok(conn)
}

fn sql_err(err: rusqlite::Error) -> String {
    err.to_string()
}

fn per_month(months: &[u8], separator: &str, term: impl Fn(u8) -> String) -> String {
    months
        .iter()
        .map(|&month| term(month))
        .collect::<Vec<_>>()
        .join(separator)
}

fn scope_cte(months: &[u8], region_count: usize) -> String {
    let month_samples = per_month(months, ", ", |m| format!("s.m{m}"));
    let total_samples = per_month(months, " + ", |m| format!("s.m{m}"));
    let regions = (1..=region_count)
        .map(|i| {
            format!(
                "l.region_code = ?{i} OR substr(l.region_code, 1, length(?{i}) + 1) = ?{i} || '-'"
            )
        })
        .collect::<Vec<_>>()
        .join(" OR ");
    format!(
        "WITH scope AS MATERIALIZED (
           SELECT s.loc_ref, {month_samples}, {total_samples} AS samples
           FROM loc_meta l JOIN loc_month_samples s USING (loc_ref)
           WHERE ({regions}) AND {total_samples} >= ?{floor}
         )",
        floor = region_count + 1
    )
}

impl OccurrencesIndex {
    pub fn query_month_hotspots(
        &self,
        settings: MonthSettings,
        query: &MonthHotspotQuery<'_>,
    ) -> Result<(Vec<LiferHotspot<'_>>, usize), String> {
        let conn = open(&self.db_path)?;
        let region_count = query.region_codes.len();
        let scope = scope_cte(query.months, region_count);
        let mut params: Vec<SqlValue> = query
            .region_codes
            .iter()
            .map(|code| SqlValue::Text(code.clone()))
            .collect();
        params.push(SqlValue::Real(settings.min_checklists));

        let candidates: i64 = conn
            .query_row(
                &format!("{scope} SELECT COUNT(*) FROM scope"),
                params_from_iter(params.iter()),
                |row| row.get(0),
            )
            .map_err(sql_err)?;

        let seen = query
            .seen
            .ids
            .iter()
            .map(i32::to_string)
            .collect::<Vec<_>>()
            .join(",");
        let weighted_score = per_month(query.months, " + ", |m| format!("p.m{m} * scope.m{m}"));
        let sql = format!(
            "{scope}
             SELECT scope.loc_ref, scope.samples, COUNT(*) AS total_species,
                    SUM(p.species_id NOT IN ({seen})) AS lifers
             FROM scope JOIN loc_month_species p USING (loc_ref)
             WHERE scope.samples >= ?{min_checklists}
               AND {weighted_score} >= ?{threshold} * scope.samples
             GROUP BY scope.loc_ref
             HAVING lifers > 0
             ORDER BY lifers DESC, scope.samples DESC
             LIMIT ?{limit}",
            min_checklists = region_count + 2,
            threshold = region_count + 3,
            limit = region_count + 4,
        );
        params.push(SqlValue::Real(query.min_checklists));
        params.push(SqlValue::Real(
            (query.frequency * settings.score_scale).round(),
        ));
        params.push(SqlValue::Integer(query.limit as i64));

        let mut stmt = conn.prepare(&sql).map_err(sql_err)?;
        let rows = stmt
            .query_map(params_from_iter(params.iter()), |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .map_err(sql_err)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(sql_err)?;

        let items = rows
            .into_iter()
            .filter(|(loc_ref, ..)| (0..self.num_locs as i64).contains(loc_ref))
            .map(|(loc_ref, samples, total_species, lifers)| {
                let r = loc_ref as usize;
                LiferHotspot {
                    id: &self.loc_id[r],
                    name: &self.loc_name[r],
                    lat: f64::from(self.lat[r]),
                    lng: f64::from(self.lng[r]),
                    region_code: &self.region_table[self.region_ids[r] as usize],
                    lifers: lifers as i32,
                    total_species: total_species as i32,
                    checklists: samples as i32,
                }
            })
            .collect();
        Ok((items, candidates as usize))
    }
}
