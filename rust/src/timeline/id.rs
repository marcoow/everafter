use getset::Getters;
use std::{fmt::Debug, hash::Hash, marker::PhantomData};

use super::{dyn_id::DynId, EvaluationContext};

#[derive(Debug, Copy, Clone, Hash, Eq, PartialEq)]
pub struct InputId {
    id: u64,
}

impl InputId {
    pub(crate) fn first() -> InputId {
        InputId { id: 0 }
    }

    pub(crate) fn next(self) -> InputId {
        InputId { id: self.id + 1 }
    }

    pub(crate) fn typed<T, K>(self, kind: fn() -> K) -> TypedInputIdWithKind<T, K>
    where
        T: Clone + Debug + 'static,
        K: IdKindFor<T>,
    {
        TypedInputIdWithKind {
            id: self,
            marker: PhantomData,
            kind: kind(),
        }
    }
}

#[derive(Copy, Clone, Debug, Hash, Eq, PartialEq)]
pub enum IdKind {
    CellId,
    DerivedId,
    ListId,
}

pub trait IdKindFor<T>: Copy
where
    T: Debug + Clone + 'static,
{
    fn id_kind(self) -> IdKind;
}

pub trait ComputeKindFor<T>: IdKindFor<T>
where
    T: Debug + Clone + 'static,
{
}

macro_rules! id_kind {
    (cell: $id:ident) => {
        #[derive(Debug, Clone)]
        pub struct $id<T: Debug + Clone + 'static> {
            marker: PhantomData<T>,
        }

        impl<T> Copy for $id<T> where T: Debug + Clone + 'static {}

        #[allow(non_snake_case)]
        pub(crate) fn $id<T>() -> $id<T>
        where
            T: Debug + Clone + 'static,
        {
            $id {
                marker: PhantomData,
            }
        }

        impl<T> IdKindFor<T> for $id<T>
        where
            T: Clone + Debug + 'static,
        {
            fn id_kind(self) -> IdKind {
                IdKind::$id
            }
        }
    };

    (compute: $id:ident) => {
        id_kind!(cell: $id);

        impl<T> ComputeKindFor<T> for $id<T> where T: Clone + Debug + 'static {}
    };
}

id_kind!(cell: CellId);
id_kind!(compute: DerivedId);
// id_kind!(ListId, |id, inputs| {
//     let map = inputs.read_map_for::<T>();
//     let cell = map.get_list(id);
//     cell.read()
// });

#[derive(Debug)]
pub struct TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
    id: InputId,
    marker: PhantomData<T>,
    kind: K,
}

impl<T, K> TypedInputIdWithKind<T, K>
where
    T: Clone + Debug + 'static,
    K: IdKindFor<T>,
{
    pub(crate) fn to_dyn(self) -> DynId {
        DynId::new::<T>(self.id, self.kind.id_kind())
    }

    pub(crate) fn kind(self) -> IdKind {
        self.kind.id_kind()
    }

    pub(crate) fn as_unchecked_id(self) -> InputId {
        self.id
    }

    pub fn value<'a>(self, ctx: &mut EvaluationContext) -> T {
        ctx.value(self)
    }
}

impl<T, K> From<TypedInputIdWithKind<T, K>> for TypedInputId<T>
where
    T: Clone + Debug + 'static,
    K: IdKindFor<T>,
{
    fn from(input: TypedInputIdWithKind<T, K>) -> TypedInputId<T> {
        TypedInputId {
            id: input.id,
            marker: input.marker,
            kind: input.kind.id_kind(),
        }
    }
}

impl<T, K> TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
    pub(crate) fn new(id: InputId, kind: K) -> TypedInputIdWithKind<T, K> {
        TypedInputIdWithKind {
            id,
            marker: PhantomData,
            kind,
        }
    }
}

impl<T, K> TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
    pub(crate) fn next(self) -> TypedInputIdWithKind<T, K> {
        TypedInputIdWithKind {
            id: self.id.next(),
            kind: self.kind,
            marker: PhantomData,
        }
    }
}

#[derive(Debug, Clone, Hash, Eq, PartialEq, Getters)]
pub struct TypedInputId<T> {
    id: InputId,
    marker: PhantomData<T>,
    #[get = "pub(crate)"]
    kind: IdKind,
}

impl<T> TypedInputId<T>
where
    T: Debug + Clone + 'static,
{
    pub(crate) fn new(id: InputId, kind: IdKind) -> TypedInputId<T> {
        TypedInputId {
            id,
            marker: PhantomData,
            kind,
        }
    }

    pub(crate) fn as_unchecked(self) -> (InputId, IdKind) {
        (self.id, self.kind)
    }

    pub(crate) fn as_unchecked_id(self) -> InputId {
        self.id
    }

    pub(crate) fn downcast<K: IdKindFor<T>>(self, kind: fn() -> K) -> TypedInputIdWithKind<T, K> {
        let kind = kind();

        assert_eq!(
            self.kind,
            kind.id_kind(),
            "attempted to downcast a {:?} into a {:?}",
            self.kind,
            kind.id_kind()
        );

        TypedInputIdWithKind {
            id: self.id,
            marker: PhantomData,
            kind,
        }
    }
}

impl<T> From<TypedInputId<T>> for DynId
where
    T: Clone + Debug + 'static,
{
    fn from(input: TypedInputId<T>) -> Self {
        DynId::new::<T>(input.id, input.kind)
    }
}

impl<T> Copy for TypedInputId<T> where T: Clone + Debug + 'static {}

impl<T> TypedInputId<T>
where
    T: Clone + Debug + 'static,
{
    // pub(crate) fn value(&self, inputs: &Inputs) -> T {
    //     match self.kind {
    //         IdKind::CellId => CellId {
    //             marker: self.marker,
    //         }
    //         .value(self.id, inputs),
    //         IdKind::DerivedId => DerivedId {
    //             marker: self.marker,
    //         }
    //         .value(self.id, inputs),
    //         IdKind::ListId => unimplemented!(),
    //         IdKind::FunctionId => FunctionId {
    //             marker: self.marker,
    //         }
    //         .value(self.id, inputs),
    //     }
    // }

    // pub(crate) fn revision(self, inputs: PartitionedInputs<'_>) -> Option<Revision> {
    //     inputs.revision(self)
    // }
}

impl<T, K> Hash for TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.kind.id_kind().hash(state);
        self.id.hash(state);
    }
}

impl<T, K> PartialEq for TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl<T, K> Eq for TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
}

impl<T, K> Copy for TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
}

impl<T, K> Clone for TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
    fn clone(&self) -> Self {
        *self
    }
}
