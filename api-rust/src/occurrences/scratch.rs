use std::ops::{Deref, DerefMut};
use std::sync::Mutex;

const MAX_RETAINED_BUFFERS: usize = 16;

pub struct ScratchPool {
    len: usize,
    buffers: Mutex<Vec<Vec<i32>>>,
}

impl ScratchPool {
    pub fn new(len: usize) -> Self {
        Self {
            len,
            buffers: Mutex::new(Vec::new()),
        }
    }

    pub fn take_zeroed(&self) -> Scratch<'_> {
        let recycled = self
            .buffers
            .lock()
            .ok()
            .and_then(|mut buffers| buffers.pop());
        let buffer = match recycled {
            Some(mut buffer) => {
                buffer.fill(0);
                buffer
            }
            None => vec![0; self.len],
        };
        Scratch { pool: self, buffer }
    }
}

pub struct Scratch<'a> {
    pool: &'a ScratchPool,
    buffer: Vec<i32>,
}

impl Deref for Scratch<'_> {
    type Target = [i32];

    fn deref(&self) -> &[i32] {
        &self.buffer
    }
}

impl DerefMut for Scratch<'_> {
    fn deref_mut(&mut self) -> &mut [i32] {
        &mut self.buffer
    }
}

impl Drop for Scratch<'_> {
    fn drop(&mut self) {
        if let Ok(mut buffers) = self.pool.buffers.lock()
            && buffers.len() < MAX_RETAINED_BUFFERS
        {
            buffers.push(std::mem::take(&mut self.buffer));
        }
    }
}
