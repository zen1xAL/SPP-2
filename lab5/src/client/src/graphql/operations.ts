import { gql } from '@apollo/client';

export const GET_PRODUCTS = gql`
  query GetProducts(
    $first: Int
    $after: String
    $search: String
    $category: String
    $minPrice: Float
    $maxPrice: Float
    $sortBy: String
    $sortOrder: String
  ) {
    products(
      first: $first
      after: $after
      search: $search
      category: $category
      minPrice: $minPrice
      maxPrice: $maxPrice
      sortBy: $sortBy
      sortOrder: $sortOrder
    ) {
      totalCount
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        cursor
        node {
          id
          title
          description
          price
          category
          brand
          rating
          source
          createdAt
          reviewCount
          totalStock
          inStock
        }
      }
    }
  }
`;

export const GET_PRODUCT_DETAILS = gql`
  query GetProductDetails($id: ID!) {
    product(id: $id) {
      id
      title
      description
      price
      category
      brand
      rating
      source
      createdAt
      # Вложенность 2: история цен
      priceHistory {
        id
        price
        recordedAt
      }
      # Вложенность 3: отзывы из подграфа Reviews
      reviews {
        id
        author
        rating
        comment
        createdAt
      }
      reviewCount
      averageRating
      # Вложенность 4: остатки из подграфа Inventory
      inventory {
        id
        warehouseId
        warehouseName
        city
        quantity
        updatedAt
      }
      totalStock
      inStock
    }
  }
`;

export const GET_CATEGORIES = gql`
  query GetCategories {
    categories {
      id
      name
      slug
    }
    warehouses {
      id
      name
      city
    }
  }
`;

export const GET_SYSTEM_METRICS = gql`
  query GetSystemMetrics {
    systemMetrics {
      totalRequests
      totalErrors
      avgDurationMs
      uptimeSeconds
      activeSubscriptions
      memoryUsageMb
    }
    databaseStats {
      productsCount
      reviewsCount
      priceHistoryCount
      stocksCount
      totalRecords
    }
  }
`;

export const CREATE_PRODUCT = gql`
  mutation CreateProduct(
    $title: String!
    $description: String
    $price: Float!
    $category: String!
    $brand: String!
  ) {
    createProduct(
      title: $title
      description: $description
      price: $price
      category: $category
      brand: $brand
    ) {
      id
      title
      price
      category
      brand
      rating
      createdAt
    }
  }
`;

export const ADD_REVIEW = gql`
  mutation AddReview($productId: ID!, $author: String!, $rating: Int!, $comment: String!) {
    addReview(productId: $productId, author: $author, rating: $rating, comment: $comment) {
      id
      productId
      author
      rating
      comment
      createdAt
    }
  }
`;

export const UPDATE_STOCK = gql`
  mutation UpdateStock($productId: ID!, $warehouseId: ID!, $quantity: Int!) {
    updateStock(productId: $productId, warehouseId: $warehouseId, quantity: $quantity) {
      id
      productId
      warehouseId
      warehouseName
      city
      quantity
      updatedAt
    }
  }
`;

export const TRIGGER_INGESTION = gql`
  mutation TriggerDataIngestion($forceRefresh: Boolean) {
    triggerDataIngestion(forceRefresh: $forceRefresh) {
      productsCount
      reviewsCount
      priceHistoryCount
      stocksCount
      totalRecords
    }
  }
`;

export const TICKER_SUBSCRIPTION = gql`
  subscription OnTickerUpdated {
    tickerUpdated {
      productId
      title
      oldPrice
      newPrice
      changePercent
      timestamp
    }
  }
`;

export const REVIEW_SUBSCRIPTION = gql`
  subscription OnReviewAdded {
    reviewAdded {
      id
      productId
      productTitle
      author
      rating
      comment
      createdAt
    }
  }
`;

export const STOCK_SUBSCRIPTION = gql`
  subscription OnStockUpdated {
    stockUpdated {
      productId
      warehouseName
      city
      quantity
      updatedAt
    }
  }
`;

