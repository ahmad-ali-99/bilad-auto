<?php
/**
 * صفحة المشروع المفرد
 *
 * @package BiladAuto
 */

get_header();

while ( have_posts() ) :
	the_post();
	$capacity = get_post_meta( get_the_ID(), '_bilad_capacity', true );
	$panels   = get_post_meta( get_the_ID(), '_bilad_panels', true );
	$savings  = get_post_meta( get_the_ID(), '_bilad_savings', true );
	$location = get_post_meta( get_the_ID(), '_bilad_location', true );
	$year     = get_post_meta( get_the_ID(), '_bilad_year', true );
	$terms    = get_the_terms( get_the_ID(), 'project_type' );
	?>

	<header class="page-header">
		<div class="container">
			<?php if ( $terms && ! is_wp_error( $terms ) ) : ?>
				<span class="section-eyebrow"><?php echo esc_html( $terms[0]->name ); ?></span>
			<?php endif; ?>
			<h1 class="page-title"><?php the_title(); ?></h1>
			<?php if ( $location || $year ) : ?>
				<p class="page-subtitle"><?php echo esc_html( trim( $location . ( $location && $year ? ' | ' : '' ) . $year ) ); ?></p>
			<?php endif; ?>
		</div>
	</header>

	<section class="section">
		<div class="container">

			<?php if ( has_post_thumbnail() ) : ?>
				<div class="single-project-img fade-in">
					<?php the_post_thumbnail( 'full' ); ?>
				</div>
			<?php endif; ?>

			<?php if ( $capacity || $panels || $savings ) : ?>
				<div class="project-stats-row fade-in">
					<?php if ( $capacity ) : ?>
						<div class="project-stat">
							<span class="stat-value"><?php echo esc_html( $capacity ); ?></span>
							<span class="stat-label"><?php esc_html_e( 'القدرة', 'bilad-auto' ); ?></span>
						</div>
					<?php endif; ?>
					<?php if ( $panels ) : ?>
						<div class="project-stat">
							<span class="stat-value"><?php echo esc_html( $panels ); ?></span>
							<span class="stat-label"><?php esc_html_e( 'لوح شمسي', 'bilad-auto' ); ?></span>
						</div>
					<?php endif; ?>
					<?php if ( $savings ) : ?>
						<div class="project-stat">
							<span class="stat-value"><?php echo esc_html( $savings ); ?></span>
							<span class="stat-label"><?php esc_html_e( 'وفر شهري', 'bilad-auto' ); ?></span>
						</div>
					<?php endif; ?>
				</div>
			<?php endif; ?>

			<div class="single-content fade-in">
				<?php the_content(); ?>
			</div>

		</div>
	</section>

	<section class="cta-section section">
		<div class="container">
			<div class="cta-box">
				<h2><?php esc_html_e( 'تريد مشروعاً مشابهاً؟', 'bilad-auto' ); ?></h2>
				<a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>" class="btn btn-gold">
					<?php esc_html_e( 'تواصل معنا', 'bilad-auto' ); ?>
				</a>
			</div>
		</div>
	</section>

	<?php
endwhile;

get_footer();
