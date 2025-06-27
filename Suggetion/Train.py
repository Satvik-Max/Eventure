import pandas as pd
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import MinMaxScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from collections import defaultdict
import random
from datetime import datetime
from geopy.distance import geodesic
import warnings
from datetime import timedelta
warnings.filterwarnings('ignore')

torch.manual_seed(42)
np.random.seed(42)
random.seed(42)

class IndianEventRecommender:
    def __init__(self):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.city_coords = self._initialize_indian_city_coordinates()
        self.scaler = MinMaxScaler()
        self.user_encoder = LabelEncoder()
        self.event_encoder = LabelEncoder()
        self.model = None
        self.event_categories = [
            'technology', 'bollywood', 'art', 'cricket', 'food', 'business',
            'education', 'yoga', 'travel', 'entertainment', 'fashion',
            'photography', 'science', 'literature', 'dance', 'theater',
            'gaming', 'automotive', 'real_estate', 'finance', 'spiritual',
            'cultural', 'wedding', 'startups', 'health'
        ]
        
    def _initialize_indian_city_coordinates(self):
        """Coordinates for major Indian cities"""
        return {
            'Mumbai': (19.0760, 72.8777),
            'Delhi': (28.7041, 77.1025),
            'Bangalore': (12.9716, 77.5946),
            'Hyderabad': (17.3850, 78.4867),
            'Ahmedabad': (23.0225, 72.5714),
            'Chennai': (13.0827, 80.2707),
            'Kolkata': (22.5726, 88.3639),
            'Pune': (18.5204, 73.8567),
            'Jaipur': (26.9124, 75.7873),
            'Surat': (21.1702, 72.8311),
            'Lucknow': (26.8467, 80.9462),
            'Kanpur': (26.4499, 80.3319),
            'Nagpur': (21.1458, 79.0882),
            'Indore': (22.7196, 75.8577),
            'Thane': (19.2183, 72.9781),
            'Bhopal': (23.2599, 77.4126),
            'Visakhapatnam': (17.6868, 83.2185),
            'Patna': (25.5941, 85.1376),
            'Vadodara': (22.3072, 73.1812),
            'Ghaziabad': (28.6692, 77.4538),
            'Ludhiana': (30.9010, 75.8573),
            'Agra': (27.1767, 78.0081),
            'Nashik': (19.9975, 73.7898),
            'Faridabad': (28.4089, 77.3178),
            'Meerut': (28.6139, 77.2090)
        }
    
    def generate_sample_data(self, n_events=2000, n_users=5000, n_interactions=30000):
        """Generate sample Indian event data"""
        
        indian_event_templates = {
            'technology': [
                'Tech Summit {} Bangalore', 'AI Conference {} Hyderabad', 
                'Startup Pitch {} Mumbai', 'Digital India {} Delhi'
            ],
            'bollywood': [
                'Film Festival {} Mumbai', 'Celebrity Night {} Delhi',
                'Award Function {} Goa', 'Movie Premiere {} Mumbai'
            ],
            'cricket': [
                'IPL Match {} Mumbai', 'Cricket Tournament {} Delhi',
                'Sports Festival {} Bangalore', 'Cricket Clinic {} Kolkata'
            ],
            'food': [
                'Food Festival {} Delhi', 'Street Food Tour {} Mumbai',
                'Mango Festival {} Lucknow', 'Spice Expo {} Hyderabad'
            ],
            'cultural': [
                'Diwali Mela {} Delhi', 'Holi Festival {} Mathura',
                'Durga Puja {} Kolkata', 'Ganesh Chaturthi {} Mumbai'
            ],
            'spiritual': [
                'Yoga Retreat {} Rishikesh', 'Meditation Camp {} Dharamshala',
                'Ayurveda Workshop {} Kerala', 'Temple Festival {} Varanasi'
            ]
        }
        
        events = []
        for i in range(1, n_events + 1):
            category = random.choice(self.event_categories)
            city = random.choice(list(self.city_coords.keys()))
            
            if category in indian_event_templates:
                title = random.choice(indian_event_templates[category]).format(2024)
            else:
                title = f"{category.title()} Event {2024} {city}"
            
            events.append({
                'event_id': i,
                'title': title,
                'category': category,
                'description': f"Join this amazing {category} event in {city}",
                'city': city,
                'price': round(random.uniform(0, 2000), 2),
                'capacity': random.randint(50, 5000),
                'duration_hours': random.randint(1, 12),
                'organizer_rating': round(random.uniform(2.5, 5.0), 1)
            })
        
        events_df = pd.DataFrame(events)
        
        indian_names = [
            'Aarav', 'Aanya', 'Vihaan', 'Ananya', 'Aditya', 'Diya', 
            'Krishna', 'Ishaan', 'Myra', 'Shaurya', 'Anika', 'Arjun'
        ]
        
        users = []
        for i in range(1, n_users + 1):
            city = random.choice(list(self.city_coords.keys()))
            age = random.randint(18, 70)
            interests = random.sample(self.event_categories, k=random.randint(2, 4))
            
            users.append({
                'user_id': i,
                'name': f"{random.choice(indian_names)} {random.choice(indian_names)}",
                'age': age,
                'city': city,
                'interests': ','.join(interests),
                'join_date': (datetime.now() - timedelta(days=random.randint(30, 730))).strftime('%Y-%m-%d')
            })
        
        users_df = pd.DataFrame(users)
        
        interactions = []
        for i in range(1, n_interactions + 1):
            user_id = random.randint(1, n_users)
            event_id = random.randint(1, n_events)
            
            user_city = users_df.loc[users_df['user_id'] == user_id, 'city'].values[0]
            event_city = events_df.loc[events_df['event_id'] == event_id, 'city'].values[0]
            distance = geodesic(self.city_coords[user_city], self.city_coords[event_city]).km
            
            user_interests = users_df.loc[users_df['user_id'] == user_id, 'interests'].values[0].split(',')
            event_category = events_df.loc[events_df['event_id'] == event_id, 'category'].values[0]
            
            if distance < 100 and event_category in user_interests:
                interaction_type = random.choices(
                    ['view', 'like', 'bookmark', 'purchase', 'review'],
                    weights=[0.1, 0.2, 0.3, 0.3, 0.1]
                )[0]
            else:
                interaction_type = random.choices(
                    ['view', 'like', 'bookmark', 'purchase', 'review'],
                    weights=[0.5, 0.3, 0.15, 0.04, 0.01]
                )[0]
            
            interactions.append({
                'interaction_id': i,
                'user_id': user_id,
                'event_id': event_id,
                'interaction_type': interaction_type,
                'timestamp': (datetime.now() - timedelta(days=random.randint(1, 180))).strftime('%Y-%m-%d %H:%M:%S')
            })
        
        interactions_df = pd.DataFrame(interactions)
        
        return events_df, users_df, interactions_df
    
    def preprocess_data(self, events_df, users_df, interactions_df):
        """Preprocess all datasets and create features"""
        
        users_df['user_id'] = self.user_encoder.fit_transform(users_df['user_id'])
        events_df['event_id'] = self.event_encoder.fit_transform(events_df['event_id'])
        interactions_df['user_id'] = self.user_encoder.transform(interactions_df['user_id'])
        interactions_df['event_id'] = self.event_encoder.transform(interactions_df['event_id'])
        
        events_df = self._process_events(events_df)
        
        users_df = self._process_users(users_df)
        
        interactions_df = self._process_interactions(interactions_df)
        
        self.interaction_matrix = self._create_interaction_matrix(users_df, events_df, interactions_df)
        
        return events_df, users_df, interactions_df
    
    def _process_events(self, events_df):
        """Feature engineering for events"""
        
        tfidf = TfidfVectorizer(max_features=50, stop_words='english')
        title_features = tfidf.fit_transform(events_df['title'])
        events_df = pd.concat([
            events_df,
            pd.DataFrame(title_features.toarray(), columns=[f'title_tfidf_{i}' for i in range(title_features.shape[1])])
        ], axis=1)
        
        events_df = pd.concat([
            events_df,
            pd.get_dummies(events_df['category'], prefix='category')
        ], axis=1)
        
        events_df['lat'] = events_df['city'].map(lambda x: self.city_coords.get(x, (0, 0))[0])
        events_df['lon'] = events_df['city'].map(lambda x: self.city_coords.get(x, (0, 0))[1])
        
        num_cols = ['price', 'capacity', 'duration_hours', 'organizer_rating']
        events_df[num_cols] = self.scaler.fit_transform(events_df[num_cols])
        
        return events_df
    
    def _process_users(self, users_df):
        """Feature engineering for users"""
        
        for category in self.event_categories:
            users_df[f'int_{category}'] = users_df['interests'].str.contains(category).astype(int)
        
        users_df['lat'] = users_df['city'].map(lambda x: self.city_coords.get(x, (0, 0))[0])
        users_df['lon'] = users_df['city'].map(lambda x: self.city_coords.get(x, (0, 0))[1])
        
        users_df['join_date'] = pd.to_datetime(users_df['join_date'])
        users_df['days_since_join'] = (datetime.now() - users_df['join_date']).dt.days
        
        num_cols = ['age', 'days_since_join']
        users_df[num_cols] = self.scaler.fit_transform(users_df[num_cols])
        
        return users_df
    
    def _process_interactions(self, interactions_df):
        """Process interaction data"""
        
        interactions_df['timestamp'] = pd.to_datetime(interactions_df['timestamp'])
        
        interaction_weights = {
            'view': 1,
            'like': 2,
            'bookmark': 3,
            'review': 4,
            'purchase': 5
        }
        interactions_df['weight'] = interactions_df['interaction_type'].map(interaction_weights)
        
        return interactions_df
    
    def _create_interaction_matrix(self, users_df, events_df, interactions_df):
        """Create user-event interaction matrix"""
        
        n_users = len(users_df)
        n_events = len(events_df)
        interaction_matrix = np.zeros((n_users, n_events))
        
        for _, row in interactions_df.iterrows():
            user_id = row['user_id']
            event_id = row['event_id']
            weight = row['weight']
            
            if weight > interaction_matrix[user_id, event_id]:
                interaction_matrix[user_id, event_id] = weight
        
        return interaction_matrix
    
    def train_model(self, events_df, users_df, n_epochs=20, batch_size=64):
        """Train the recommendation model"""
        
        class EventDataset(Dataset):
            def __init__(self, users, events, interactions):
                self.users = users
                self.events = events
                self.interactions = interactions
                
            def __len__(self):
                return len(self.interactions)
                
            def __getitem__(self, idx):
                user_id = int(self.interactions[idx, 0])
                event_id = int(self.interactions[idx, 1])
                label = self.interactions[idx, 2]
                user_features = self.users[user_id]
                event_features = self.events[event_id].astype(np.float32)

                return (
                    torch.tensor(user_id, dtype=torch.long),
                    torch.tensor(event_id, dtype=torch.long),
                    torch.tensor(user_features, dtype=torch.float32),
                    torch.tensor(event_features, dtype=torch.float32),
                    torch.tensor(label, dtype=torch.float32)
                )

        
        user_features = users_df.drop(['user_id', 'name', 'city', 'interests', 'join_date'], axis=1).values
        event_features = events_df.drop(['event_id', 'title', 'description', 'category', 'city'], axis=1).values
        
        positive_interactions = np.argwhere(self.interaction_matrix > 0)
        positive_labels = self.interaction_matrix[self.interaction_matrix > 0].reshape(-1, 1)
        positive_data = np.hstack([positive_interactions, positive_labels])
        
        negative_samples = min(2 * len(positive_interactions), len(users_df) * len(events_df) - len(positive_interactions))
        negative_interactions = []
        while len(negative_interactions) < negative_samples:
            user_id = random.randint(0, len(users_df) - 1)
            event_id = random.randint(0, len(events_df) - 1)
            if self.interaction_matrix[user_id, event_id] == 0:
                negative_interactions.append([user_id, event_id, 0])
        
        all_interactions = np.vstack([positive_data, np.array(negative_interactions)])
        train_data, val_data = train_test_split(all_interactions, test_size=0.2, random_state=42)
        
        train_dataset = EventDataset(user_features, event_features, train_data)
        val_dataset = EventDataset(user_features, event_features, val_data)
        
        train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
        val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
        
        self.model = HybridRecommender(
            num_users=len(users_df),
            num_events=len(events_df),
            user_feature_dim=user_features.shape[1],
            event_feature_dim=event_features.shape[1],
            embedding_dim=64
        ).to(self.device)
        
        criterion = nn.BCELoss()
        optimizer = torch.optim.Adam(self.model.parameters(), lr=0.001)
        
        for epoch in range(n_epochs):
            self.model.train()
            train_loss = 0
            for user_ids, event_ids, user_feats, event_feats, labels in train_loader:
                user_ids = user_ids.to(self.device)
                event_ids = event_ids.to(self.device)
                user_feats = user_feats.float().to(self.device)
                event_feats = event_feats.float().to(self.device)
                labels = labels.float().to(self.device)
                
                optimizer.zero_grad()
                outputs = self.model(user_ids, event_ids, user_feats, event_feats)
                loss = criterion(outputs.squeeze(), labels)
                loss.backward()
                optimizer.step()
                train_loss += loss.item()
            
            self.model.eval()
            val_loss = 0
            with torch.no_grad():
                for user_ids, event_ids, user_feats, event_feats, labels in val_loader:
                    user_ids = user_ids.to(self.device)
                    event_ids = event_ids.to(self.device)
                    user_feats = user_feats.float().to(self.device)
                    event_feats = event_feats.float().to(self.device)
                    labels = labels.float().to(self.device)
                    
                    outputs = self.model(user_ids, event_ids, user_feats, event_feats)
                    val_loss += criterion(outputs, labels).item()
            
            print(f"Epoch {epoch+1}: Train Loss: {train_loss/len(train_loader):.4f}, Val Loss: {val_loss/len(val_loader):.4f}")
    
    def recommend_events(self, user_id, events_df, users_df, top_n=10, radius_km=200):
        """Generate recommendations for a specific user"""
        
        user_idx = self.user_encoder.transform([user_id])[0]
        user_city = users_df.loc[users_df['user_id'] == user_id, 'city'].values[0]
        user_lat, user_lon = self.city_coords[user_city]
        
        events_df['distance'] = events_df.apply(
            lambda row: geodesic((user_lat, user_lon), (row['lat'], row['lon'])).km,
            axis=1
        )
        nearby_events = events_df[events_df['distance'] <= radius_km]
        
        if len(nearby_events) == 0:
            print(f"No events found within {radius_km}km of {user_city}")
            return pd.DataFrame()
    
        user_features = users_df.drop(['user_id', 'name', 'city', 'interests', 'join_date'], axis=1).iloc[user_idx].values
        user_features = torch.FloatTensor(user_features).unsqueeze(0).to(self.device)
        
        event_indices = nearby_events['event_id'].values
        event_features = nearby_events.drop(['event_id', 'title', 'description', 'category', 'city', 'distance'], axis=1).values
        event_features = torch.FloatTensor(event_features).to(self.device)
        
        with torch.no_grad():
            self.model.eval()
            user_ids = torch.LongTensor([user_idx] * len(event_indices)).to(self.device)
            event_ids = torch.LongTensor(event_indices).to(self.device)
            
            user_feats = user_features.repeat(len(event_indices), 1)
            scores = self.model(user_ids, event_ids, user_feats, event_features).cpu().numpy().flatten()
        
        nearby_events['score'] = scores
        recommendations = nearby_events.sort_values('score', ascending=False).head(top_n)
        
        return recommendations[['event_id', 'title', 'category', 'city', 'distance', 'price', 'score']]

class HybridRecommender(nn.Module):
    def __init__(self, num_users, num_events, user_feature_dim, event_feature_dim, embedding_dim=64):
        super().__init__()
        self.user_embedding = nn.Embedding(num_users, embedding_dim)
        self.event_embedding = nn.Embedding(num_events, embedding_dim)
        
        self.user_content = nn.Sequential(
            nn.Linear(user_feature_dim, embedding_dim),
            nn.ReLU()
        )
        self.event_content = nn.Sequential(
            nn.Linear(event_feature_dim, embedding_dim),
            nn.ReLU()
        )
        
        self.predictor = nn.Sequential(
            nn.Linear(embedding_dim*4, 128),
            nn.ReLU(),
            nn.Linear(128, 1),
            nn.Sigmoid()
        )
    
    def forward(self, user_ids, event_ids, user_features, event_features):
        user_emb = self.user_embedding(user_ids)
        event_emb = self.event_embedding(event_ids)
        
        user_content = self.user_content(user_features)
        event_content = self.event_content(event_features)
        
        combined = torch.cat([user_emb, event_emb, user_content, event_content], dim=1)
        return self.predictor(combined)

if __name__ == "__main__":
    recommender = IndianEventRecommender()
    
    print("Generating sample Indian event data...")
    events_df, users_df, interactions_df = recommender.generate_sample_data(
        n_events=2000,
        n_users=5000,
        n_interactions=30000
    )
    
    print("\nPreprocessing data...")
    events_df, users_df, interactions_df = recommender.preprocess_data(events_df, users_df, interactions_df)
    
    print("\nTraining recommendation model...")
    recommender.train_model(events_df, users_df, n_epochs=15)
    
    test_user_id = random.choice(users_df['user_id'].unique())
    print(f"\nGenerating recommendations for user {test_user_id}...")
    recommendations = recommender.recommend_events(test_user_id, events_df, users_df, top_n=10)
    
    print("\nTop 10 Recommendations:")
    print(recommendations)