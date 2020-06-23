#[derive(Hash, Copy, Clone, PartialEq, Eq, Debug)]
pub struct Id {
  zone: u64,
  seq: u64,
}

use std::fmt;
impl fmt::Display for Id {
  fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
    write!(f, "{}.{}", self.zone, self.seq)
  }
}

pub trait Identified {
  fn id(&self) -> Id;
}

use std::cell::Cell;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_ZONE: AtomicU64 = AtomicU64::new(1);

fn next_zone() -> u64 {
  NEXT_ZONE.fetch_add(1, Ordering::Relaxed)
}

thread_local! {
  static ZONE: u64 = next_zone();
  static NEXT_SEQ: Cell<u64> = Cell::new(0);
}

impl Id {
  pub fn new() -> Id {
    ZONE.with(|zone| {
      NEXT_SEQ.with(|cell| {
        let seq = cell.get();
        cell.set(seq + 1);
        Id { zone: *zone, seq }
      })
    })
  }
}

#[test]
fn ids_are_sequenced() {
  let a = Id::new();
  let b = Id::new();
  let c = Id::new();
  assert_eq!(b.seq, a.seq + 1);
  assert_eq!(c.seq, b.seq + 1);
}

#[test]
fn ids_seqs_start_at_zero_in_each_thread() {
  std::thread::spawn(|| {
    let a = Id::new();
    let b = Id::new();
    let c = Id::new();
    assert_eq!(a.seq, 0);
    assert_eq!(b.seq, 1);
    assert_eq!(c.seq, 2);
  });
}

#[test]
fn each_thread_has_its_own_zone() {
  let t1 = std::thread::spawn(|| {
    let a = Id::new();
    let b = Id::new();
    let c = Id::new();
    assert_eq!(a.zone, b.zone);
    assert_eq!(b.zone, c.zone);
    a.zone
  });
  
  let t2 = std::thread::spawn(|| {
    let a = Id::new();
    let b = Id::new();
    let c = Id::new();
    assert_eq!(a.zone, b.zone);
    assert_eq!(b.zone, c.zone);
    a.zone
  });

  assert_ne!(t1.join().unwrap(), t2.join().unwrap());
}

#[test]
fn ids_from_the_same_thread_are_in_the_same_zone() {
  std::thread::spawn(|| {
    let a = Id::new();
    let b = Id::new();
    let c = Id::new();
    assert_eq!(a.zone, b.zone);
    assert_eq!(b.zone, c.zone);
    assert_eq!(a.seq, 0);
    assert_eq!(b.seq, 1);
    assert_eq!(c.seq, 2);
  });
}

#[test]
fn ids_are_unique_across_threads() {
  fn create_a_bunch_of_ids() -> Vec<Id> {
    let mut ids = vec![];
    for i in 0..100 {
      let n = Id::new();
      assert_eq!(n.seq, i);
      ids.push(n);
    }
    ids
  }

  let mut threads = vec![];
  for _ in 0..100 {
    threads.push(std::thread::spawn(create_a_bunch_of_ids));
  }

  let mut seen = std::collections::HashMap::new();
  for t in threads {
    let ids = t.join().unwrap();
    for n in ids {
      assert!(!seen.contains_key(&n));
      seen.insert(n, true);
    }
  }
  assert_eq!(seen.len(), 100 * 100);
}
