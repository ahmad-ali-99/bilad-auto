<?php
/**
 * أرشيف المشاريع
 *
 * @package BiladAuto
 */

get_header();
?>

<header class="page-header">
	<div class="container">
		<span class="section-eyebrow"><?php esc_html_e( 'أعمالنا', 'bilad-auto' ); ?></span>
		<h1 class="page-title"><?php esc_html_e( 'المشاريع المنجزة', 'bilad-auto' ); ?></h1>
		<p class="page-subtitle"><?php esc_html_e( 'من البيت إلى المصنع — كل مشروع قصة نجاح حقيقية', 'bilad-auto' ); ?></p>
	</div>
</header>

<!-- فلاتر التصنيف -->
<?php
$types = get_terms( array( 'taxonomy' => 'project_type', 'hide_empty' => true ) );
if ( ! is_wp_error( $types ) && ! empty( $types ) ) :
	?>
	<section class="section-sm">
		<div class="container">
			<div class="filter-bar">
				<button class="filter-btn active" data-filter="all"><?php esc_html_e( 'الكل', 'bilad-auto' ); ?></button>
				<?php foreach ( $types as $type ) : ?>
					<button class="filter-btn" data-filter="<?php echo esc_attr( $type->slug ); ?>">
						<?php echo esc_html( $type->name ); ?>
					</button>
				<?php endforeach; ?>
			</div>
		</div>
	</section>
<?php endif; ?>

<section class="section">
	<div class="container">
		<?php if ( have_posts() ) : ?>
			<div class="projects-grid" id="projects-grid">
				<?php
				while ( have_posts() ) :
					the_post();
					$terms      = get_the_terms( get_the_ID(), 'project_type' );
					$term_slugs = ( $terms && ! is_wp_error( $terms ) ) ? wp_list_pluck( $terms, 'slug' ) : array();
					$capacity   = get_post_meta( get_the_ID(), '_bilad_capacity', true );
					$location   = get_post_meta( get_the_ID(), '_bilad_location', true );
					$year       = get_post_meta( get_the_ID(), '_bilad_year', true );
					?>
					<article class="project-card fade-in" data-category="<?php echo esc_attr( implode( ' ', $term_slugs ) ); ?>">
						<a href="<?php the_permalink(); ?>" class="project-card-img">
							<?php
							if ( has_post_thumbnail() ) {
								the_post_thumbnail( 'bilad-project' );
							}
							?>
							<?php if ( $capacity ) : ?>
								<div class="project-card-overlay">
									<span class="project-kw"><?php echo esc_html( $capacity ); ?></span>
								</div>
							<?php endif; ?>
						</a>
						<div class="project-card-body">
							<?php if ( $terms && ! is_wp_error( $terms ) ) : ?>
								<span class="project-type-badge"><?php echo esc_html( $terms[0]->name ); ?></span>
							<?php endif; ?>
							<h3><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h3>
							<?php if ( $location || $year ) : ?>
								<p class="project-meta">
									<?php echo esc_html( trim( $location . ( $location && $year ? ' | ' : '' ) . $year ) ); ?>
								</p>
							<?php endif; ?>
						</div>
					</article>
					<?php
				endwhile;
				?>
			</div>

			<div class="pagination-wrap">
				<?php the_posts_pagination( array( 'prev_text' => esc_html__( 'السابق', 'bilad-auto' ), 'next_text' => esc_html__( 'التالي', 'bilad-auto' ) ) ); ?>
			</div>
		<?php else : ?>
			<div class="no-results">
				<p><?php esc_html_e( 'لم تُضف مشاريع بعد. أضفها من: لوحة التحكم ← المشاريع', 'bilad-auto' ); ?></p>
			</div>
		<?php endif; ?>
	</div>
</section>

<section class="cta-section section">
	<div class="container">
		<div class="cta-box">
			<h2><?php esc_html_e( 'مشروعك القادم يستاهل الأفضل', 'bilad-auto' ); ?></h2>
			<a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>" class="btn btn-gold">
				<?php esc_html_e( 'احصل على عرض سعر مجاني', 'bilad-auto' ); ?>
			</a>
		</div>
	</div>
</section>

<?php get_footer(); ?>
